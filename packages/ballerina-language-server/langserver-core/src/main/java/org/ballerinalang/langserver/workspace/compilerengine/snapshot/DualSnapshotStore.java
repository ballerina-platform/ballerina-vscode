/*
 *  Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com)
 *
 *  WSO2 LLC. licenses this file to you under the Apache License,
 *  Version 2.0 (the "License"); you may not use this file except
 *  in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing,
 *  software distributed under the License is distributed on an
 *  "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 *  KIND, either express or implied.  See the License for the
 *  specific language governing permissions and limitations
 *  under the License.
 */

package org.ballerinalang.langserver.workspace.compilerengine.snapshot;

import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.syntax.tree.SyntaxTree;
import io.ballerina.projects.DocumentId;
import io.ballerina.projects.ModuleId;
import io.ballerina.projects.PackageCompilation;
import org.ballerinalang.langserver.workspace.compilerengine.CompilationKey;
import org.ballerinalang.langserver.workspace.workspacemanager.change.ContentVersion;
import org.eclipse.lsp4j.jsonrpc.CancelChecker;

import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Consumer;
import java.util.logging.Logger;

import javax.annotation.Nonnull;

/**
 * Thread-safe per-package store for stable and in-progress snapshots.
 *
 * <p>Bounded: at most {@code maxStableSnapshots} stable snapshots are retained
 * simultaneously. When the limit is exceeded after publishing a new snapshot,
 * the least-recently-accessed stable snapshot is proactively cleared to free
 * the symbol graph memory it holds (compilation, semantic models, syntax trees).
 * The cleared entry's pipeline and in-progress slot are preserved so a
 * recompile can be triggered on the next request.
 *
 * <p>Implements the "Last Known Good" stale model serving requirement
 * by providing access to the previously-stable snapshot while a new compilation is in progress.</p>
 *
 * <p>An optional eviction listener receives the {@link CompilationKey} of each
...
 * LRU-evicted snapshot, allowing callers to coordinate cross-context cleanup
 * (e.g., evicting the corresponding project from the project cache so that the
 * shared {@code PackageCompilation} becomes eligible for GC).
 *
 * @since 1.7.0
 */
public class DualSnapshotStore {
    private static final ContentVersion INITIAL_CONTENT_VERSION = new ContentVersion(0);
    private static final int DEFAULT_MAX_STABLE_SNAPSHOTS = 16;
    private static final Logger LOG = Logger.getLogger(DualSnapshotStore.class.getName());
    private final ConcurrentHashMap<CompilationKey, SnapshotPair> snapshots;
    private final int maxStableSnapshots;
    private volatile Consumer<CompilationKey> evictionListener;

    /**
     * Creates an empty dual snapshot store with the default stable snapshot limit (16).
     */
    public DualSnapshotStore() {
        this(DEFAULT_MAX_STABLE_SNAPSHOTS);
    }

    /**
     * Creates an empty dual snapshot store with the given stable snapshot limit.
     *
     * @param maxStableSnapshots maximum number of stable snapshots to retain; must be >= 1
     */
    public DualSnapshotStore(int maxStableSnapshots) {
        if (maxStableSnapshots < 1) {
            throw new IllegalArgumentException("maxStableSnapshots must be >= 1, got: " + maxStableSnapshots);
        }
        this.snapshots = new ConcurrentHashMap<>();
        this.maxStableSnapshots = maxStableSnapshots;
    }

    /**
     * Registers a listener that is called with the {@link CompilationKey} of each
     * stable snapshot evicted by LRU. The listener runs on the thread that triggered
     * the eviction (the compilation worker calling {@link #publishStable}).
     *
     * @param listener callback receiving the evicted key, or {@code null} to clear
     */
    public void setEvictionListener(Consumer<CompilationKey> listener) {
        this.evictionListener = listener;
    }

    /**
     * Returns the current stable snapshot for the given compilation key.
     *
     * @param key the compound compilation key (source root + package descriptor)
     * @return the latest stable snapshot, or {@code null} when none has been published
     */
    public StableSnapshot getStable(@Nonnull CompilationKey key) {
        SnapshotPair snapshotPair = snapshots.get(key);
        return snapshotPair == null ? null : snapshotPair.stableSnapshot();
    }

    /**
     * Returns the current in-progress snapshot for the given compilation key.
     *
     * @param key the compound compilation key (source root + package descriptor)
     * @return the active in-progress snapshot, or {@code null} when none is running
     */
    public InProgressSnapshot getInProgress(@Nonnull CompilationKey key) {
        SnapshotPair snapshotPair = snapshots.get(key);
        return snapshotPair == null ? null : snapshotPair.inProgressSnapshot();
    }

    /**
     * Starts a new compilation cycle for the given compilation key.
     *
     * @param key the compound compilation key (source root + package descriptor)
     * @return the newly created in-progress snapshot
     */
    public InProgressSnapshot startCompilation(@Nonnull CompilationKey key) {
        SnapshotPair snapshotPair = snapshots.computeIfAbsent(key, ignored -> new SnapshotPair());
        return snapshotPair.startCompilation();
    }

    /**
     * Publishes the latest stable snapshot for the given compilation key.
     * <p>
     * This backward-compatible overload completes whatever in-progress snapshot
     * is currently stored for the key, regardless of which worker started it.
     * Prefer {@link #publishStable(CompilationKey, StableSnapshot, InProgressSnapshot)}
     * from compilation workers that captured the specific in-progress snapshot
     * they started from, to avoid a stale worker silently completing a newer
     * snapshot's awaiting callers.
     *
     * @param key the compound compilation key (source root + package descriptor)
     * @param stableSnapshot the stable snapshot to publish
     */
    public void publishStable(@Nonnull CompilationKey key, @Nonnull StableSnapshot stableSnapshot) {
        SnapshotPair snapshotPair = snapshots.computeIfAbsent(key, ignored -> new SnapshotPair());
        snapshotPair.publishStable(stableSnapshot);
        evictLeastRecentlyUsedIfNeeded(key);
    }

    /**
     * Publishes the latest stable snapshot for the given compilation key, but
     * only if the calling worker still owns {@code owner} as the active
     * in-progress snapshot for the key. If the in-progress slot has been
     * superseded by a newer {@link #startCompilation(CompilationKey)} call (or
     * removed), the stale publish is discarded entirely — the stable slot is
     * left untouched and no in-progress future is completed — preventing a
     * stale worker from silently completing a newer snapshot's awaiting
     * callers with an older result.
     *
     * @param key the compound compilation key (source root + package descriptor)
     * @param stableSnapshot the stable snapshot to publish
     * @param owner the in-progress snapshot the calling worker started from
     */
    public void publishStable(@Nonnull CompilationKey key, @Nonnull StableSnapshot stableSnapshot,
                              @Nonnull InProgressSnapshot owner) {
        SnapshotPair snapshotPair = snapshots.get(key);
        if (snapshotPair == null) {
            return;
        }
        if (snapshotPair.publishStable(stableSnapshot, owner)) {
            evictLeastRecentlyUsedIfNeeded(key);
        }
    }

    /**
     * Cancels the current in-progress compilation for the given compilation key.
     *
     * @param key the compound compilation key (source root + package descriptor)
     */
    public void cancelInProgress(@Nonnull CompilationKey key) {
        SnapshotPair snapshotPair = snapshots.get(key);
        if (snapshotPair != null) {
            snapshotPair.cancelInProgress();
        }
    }

    /**
     * Removes all snapshot state for the given compilation key.
     *
     * @param key the compound compilation key (source root + package descriptor)
     */
    public void remove(@Nonnull CompilationKey key) {
        SnapshotPair snapshotPair = snapshots.remove(key);
        if (snapshotPair != null) {
            snapshotPair.cancelInProgress();
        }
    }

    /**
     * Clears the stable snapshot for the given key while preserving the in-progress slot.
     * This releases the symbol graph memory held by the stable snapshot without removing
     * the key from the store entirely.
     *
     * @param key the compound compilation key (source root + package descriptor)
     */
    public void clearStable(@Nonnull CompilationKey key) {
        SnapshotPair snapshotPair = snapshots.get(key);
        if (snapshotPair != null) {
            snapshotPair.clearStable();
        }
    }

    /**
     * Clears ALL stable snapshots in the store, regardless of which keys exist
     * in any external pipeline map. Also removes entries that have neither a
     * stable snapshot nor an in-progress compilation (fully dead entries).
     *
     * @return the number of stable snapshots that were actually cleared
     */
    public int clearAllStable() {
        int cleared = 0;
        var iterator = snapshots.entrySet().iterator();
        while (iterator.hasNext()) {
            var entry = iterator.next();
            SnapshotPair pair = entry.getValue();
            if (pair.hasStableSnapshot()) {
                pair.clearStable();
                cleared++;
            }
            // Release memory from in-progress fallbacks
            pair.clearInProgressFallback();

            // Remove fully dead entries (no stable, no in-progress) to prevent map growth
            if (!pair.hasStableSnapshot() && pair.inProgressSnapshot() == null) {
                iterator.remove();
            }
        }
        return cleared;
    }

    /**
     * Returns the number of keys tracked in this store.
     *
     * @return the current entry count
     */
    public int size() {
        return snapshots.size();
    }

    /**
     * Returns the maximum number of stable snapshots this store will retain.
     *
     * @return the configured stable snapshot limit
     */
    public int maxStableSnapshots() {
        return maxStableSnapshots;
    }

    /**
     * Evicts the least-recently-accessed stable snapshot if the number of entries
     * holding a stable snapshot exceeds {@code maxStableSnapshots}. The evicted entry's
     * pipeline slot and in-progress compilation are preserved — only the heavy symbol
     * graph (PackageCompilation, SemanticModel, SyntaxTree) is released.
     *
     * @param justPublished the key that was just published (excluded from eviction)
     */
    private void evictLeastRecentlyUsedIfNeeded(@Nonnull CompilationKey justPublished) {
        int stableCount = 0;
        for (SnapshotPair pair : snapshots.values()) {
            if (pair.hasStableSnapshot()) {
                stableCount++;
            }
        }
        if (stableCount <= maxStableSnapshots) {
            return;
        }

        // Find the entry with the oldest access time (excluding the just-published key)
        CompilationKey oldestKey = null;
        long oldestNanos = Long.MAX_VALUE;
        for (Map.Entry<CompilationKey, SnapshotPair> entry : snapshots.entrySet()) {
            if (entry.getKey().equals(justPublished)) {
                continue;
            }
            SnapshotPair pair = entry.getValue();
            if (pair.hasStableSnapshot() && pair.lastAccessNanos() < oldestNanos) {
                oldestNanos = pair.lastAccessNanos();
                oldestKey = entry.getKey();
            }
        }

        if (oldestKey != null) {
            SnapshotPair evictedPair = snapshots.get(oldestKey);
            if (evictedPair != null) {
                evictedPair.clearStable();
                CompilationKey evictedKey = oldestKey;
                LOG.fine(() -> "LRU eviction: cleared stable snapshot for " + evictedKey.sourceRoot()
                        + " (store holds " + maxStableSnapshots + " max)");
                Consumer<CompilationKey> listener = evictionListener;
                if (listener != null) {
                    try {
                        listener.accept(evictedKey);
                    } catch (Exception e) {
                        LOG.warning(() -> "Eviction listener failed for " + evictedKey.sourceRoot()
                                + ": " + e.getMessage());
                    }
                }
            }
        }
    }

    public static final class StoreInProgressSnapshot implements InProgressSnapshot {

        private volatile StableSnapshot fallbackStableSnapshot;
        private final ContentVersion contentVersion;
        private final CompletableFuture<StableSnapshot> publishedStableSnapshot;
        private final CompletableFuture<PackageCompilation> compilationFuture;

        StoreInProgressSnapshot(StableSnapshot fallbackStableSnapshot) {
            this.fallbackStableSnapshot = fallbackStableSnapshot;
            this.contentVersion = fallbackStableSnapshot == null ? INITIAL_CONTENT_VERSION
                    : fallbackStableSnapshot.contentVersion();
            this.publishedStableSnapshot = new CompletableFuture<>();
            this.compilationFuture = new CompletableFuture<>();
        }

        @Override
        public SyntaxTree syntaxTree(@Nonnull DocumentId docId) {
            StableSnapshot fallback = fallbackStableSnapshot;
            if (fallback == null) {
                return null;
            }
            return fallback.syntaxTree(docId);
        }

        @Override
        public ContentVersion contentVersion() {
            return contentVersion;
        }

        @Override
        public CompletableFuture<SemanticModel> semanticModel(@Nonnull ModuleId moduleId,
                                                              @Nonnull CancelChecker checker) {
            checker.checkCanceled();
            CompletableFuture<SemanticModel> result = publishedStableSnapshot.thenApply(snapshot -> {
                checker.checkCanceled();
                return snapshot.semanticModel(moduleId);
            });
            // Propagate cancellation from parent to derived future so callers see
            // CancellationException when the in-progress snapshot is cancelled.
            publishedStableSnapshot.whenComplete((snapshot, error) -> {
                if (error instanceof java.util.concurrent.CancellationException) {
                    result.cancel(false);
                }
            });
            return result;
        }

        @Override
        public CompletableFuture<PackageCompilation> compilation(@Nonnull CancelChecker checker) {
            checker.checkCanceled();
            return compilationFuture;
        }

        void complete(StableSnapshot stableSnapshot) {
            publishedStableSnapshot.complete(stableSnapshot);
            compilationFuture.complete(stableSnapshot.compilation());
            // Release fallback reference — the new stable snapshot supersedes it
            fallbackStableSnapshot = null;
        }

        StableSnapshot fallbackStableSnapshot() {
            return fallbackStableSnapshot;
        }

        void clearFallback() {
            fallbackStableSnapshot = null;
        }

        public CompletableFuture<StableSnapshot> publishedStableSnapshot() {
            return publishedStableSnapshot;
        }

        void cancel() {
            publishedStableSnapshot.cancel(false);
            compilationFuture.cancel(false);
            // Release fallback reference to allow GC of the previous snapshot's symbol graph
            fallbackStableSnapshot = null;
        }
    }
}
