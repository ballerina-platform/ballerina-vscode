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

import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Internal atomic holder for per-source-root stable and in-progress snapshots.
 *
 * @since 1.7.0
 */
final class SnapshotPair {

    private final AtomicReference<State> state = new AtomicReference<>(new State(null, null));
    private final AtomicLong lastAccessNanos = new AtomicLong(System.nanoTime());

    StableSnapshot stableSnapshot() {
        StableSnapshot snapshot = state.get().stableSnapshot();
        if (snapshot != null) {
            lastAccessNanos.set(System.nanoTime());
        }
        return snapshot;
    }

    InProgressSnapshot inProgressSnapshot() {
        return state.get().inProgressSnapshot();
    }

    InProgressSnapshot startCompilation() {
        while (true) {
            State current = state.get();
            DualSnapshotStore.StoreInProgressSnapshot next =
                    new DualSnapshotStore.StoreInProgressSnapshot(current.stableSnapshot());
            State updated = new State(current.stableSnapshot(), next);
            if (state.compareAndSet(current, updated)) {
                DualSnapshotStore.StoreInProgressSnapshot previous = current.inProgressSnapshot();
                if (previous != null) {
                    previous.cancel();
                }
                return next;
            }
            Thread.onSpinWait();
        }
    }

    void publishStable(StableSnapshot stableSnapshot) {
        while (true) {
            State current = state.get();
            State updated = new State(stableSnapshot, null);
            if (state.compareAndSet(current, updated)) {
                lastAccessNanos.set(System.nanoTime());
                DualSnapshotStore.StoreInProgressSnapshot inProgressSnapshot = current.inProgressSnapshot();
                if (inProgressSnapshot != null) {
                    inProgressSnapshot.complete(stableSnapshot);
                }
                return;
            }
            Thread.onSpinWait();
        }
    }

    /**
     * Publishes a stable snapshot only if the calling worker still owns the
     * given in-progress snapshot. If the in-progress slot has been superseded
     * by a newer {@link #startCompilation()} call (i.e., the currently stored
     * in-progress snapshot is no longer {@code owner}), the stale publish is
     * discarded entirely — the stable slot is not updated and no in-progress
     * future is completed — so a newer compilation's awaiting callers are
     * never silently resolved with an older, stale result.
     *
     * @param stableSnapshot the stable snapshot to publish
     * @param owner the in-progress snapshot the calling worker started from
     * @return {@code true} if the publish was applied; {@code false} if it was
     *         discarded because {@code owner} no longer owns the slot
     */
    boolean publishStable(StableSnapshot stableSnapshot, InProgressSnapshot owner) {
        while (true) {
            State current = state.get();
            DualSnapshotStore.StoreInProgressSnapshot currentInProgress = current.inProgressSnapshot();
            if (currentInProgress != owner) {
                // Slot was superseded by a newer startCompilation (or cleared);
                // discard the stale publish entirely.
                return false;
            }
            State updated = new State(stableSnapshot, null);
            if (state.compareAndSet(current, updated)) {
                lastAccessNanos.set(System.nanoTime());
                currentInProgress.complete(stableSnapshot);
                return true;
            }
            Thread.onSpinWait();
        }
    }

    /**
     * Returns the last access time in nanoseconds (monotonic clock).
     *
     * @return last access nanos
     */
    long lastAccessNanos() {
        return lastAccessNanos.get();
    }

    /**
     * Returns whether this pair currently holds a non-null stable snapshot.
     *
     * @return true if a stable snapshot is present
     */
    boolean hasStableSnapshot() {
        return state.get().stableSnapshot() != null;
    }

    void cancelInProgress() {
        while (true) {
            State current = state.get();
            DualSnapshotStore.StoreInProgressSnapshot inProgressSnapshot = current.inProgressSnapshot();
            if (inProgressSnapshot == null) {
                return;
            }
            State updated = new State(current.stableSnapshot(), null);
            if (state.compareAndSet(current, updated)) {
                inProgressSnapshot.cancel();
                return;
            }
            Thread.onSpinWait();
        }
    }

    void clearStable() {
        while (true) {
            State current = state.get();
            if (current.stableSnapshot() == null) {
                return;
            }
            State updated = new State(null, current.inProgressSnapshot());
            if (state.compareAndSet(current, updated)) {
                return;
            }
            Thread.onSpinWait();
        }
    }

    void clearInProgressFallback() {
        DualSnapshotStore.StoreInProgressSnapshot inProgressSnapshot = state.get().inProgressSnapshot();
        if (inProgressSnapshot != null) {
            inProgressSnapshot.clearFallback();
        }
    }

    private record State(StableSnapshot stableSnapshot,
                         DualSnapshotStore.StoreInProgressSnapshot inProgressSnapshot) {
    }
}
