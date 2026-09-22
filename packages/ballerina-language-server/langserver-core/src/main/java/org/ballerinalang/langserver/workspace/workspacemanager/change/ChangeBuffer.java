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

package org.ballerinalang.langserver.workspace.workspacemanager.change;

import org.ballerinalang.langserver.workspace.workspacemanager.uri.DocumentUri;
import org.eclipse.lsp4j.FileEvent;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Per-URI, per-layer delta queue for document changes.
 *
 * <p>Accumulates pending {@link BufferedChange} events that the ChangeApplier has not yet
 * processed. Tracks overlay layers per document — the existence of an EDITOR overlay IS the
 * open/closed signal. Thread-safe: concurrent append/drain on the same URI will not throw or
 * lose data.
 *
 * @since 1.7.0
 */
public class ChangeBuffer {
    /**
     * Per-URI, per-layer pending changes.
     * Outer key = DocumentUri. Inner key = ChangeLayer. Value = ordered queue of changes.
     */
    private final ConcurrentHashMap<DocumentUri,
            ConcurrentHashMap<ChangeLayer, ConcurrentLinkedQueue<BufferedChange>>> layeredChanges =
            new ConcurrentHashMap<>();

    /** Pending watcher events for closed documents (no EDITOR layer exists). */
    private final ConcurrentHashMap<DocumentUri, FileEvent> closedDocChanges = new ConcurrentHashMap<>();

    /** Watcher events for open documents — tracked, action deferred until EDITOR layer is removed. */
    private final ConcurrentHashMap<DocumentUri, FileEvent> deferredWatcherEvents = new ConcurrentHashMap<>();

    /**
     * Appends a buffered change to the correct URI + layer queue.
     *
     * @param uri    document identity
     * @param change the change to buffer
     */
    public void append(DocumentUri uri, BufferedChange change) {
        ConcurrentHashMap<ChangeLayer, ConcurrentLinkedQueue<BufferedChange>> layerMap =
                layeredChanges.computeIfAbsent(uri, k -> new ConcurrentHashMap<>());
        layerMap.compute(change.layer(), (layer, queue) -> {
            ConcurrentLinkedQueue<BufferedChange> target = queue == null ? new ConcurrentLinkedQueue<>() : queue;
            target.add(change);
            return target;
        });
    }

    /**
     * Ensures an overlay layer exists for the given URI without adding a pending change.
     *
     * @param uri document identity
     * @param layer overlay layer
     */
    public void ensureLayer(DocumentUri uri, ChangeLayer layer) {
        layeredChanges.computeIfAbsent(uri, k -> new ConcurrentHashMap<>())
                .computeIfAbsent(layer, ignored -> new ConcurrentLinkedQueue<>());
    }

    /**
     * Atomically drains all buffered changes for the given URI and layer, returning them in
     * insertion order and leaving the queue empty.
     *
     * @param uri   document identity
     * @param layer the overlay layer to drain
     * @return unmodifiable list of drained changes, empty if none
     */
    public List<BufferedChange> drain(DocumentUri uri, ChangeLayer layer) {
        ConcurrentHashMap<ChangeLayer, ConcurrentLinkedQueue<BufferedChange>> layerMap = layeredChanges.get(uri);
        if (layerMap == null) {
            return Collections.emptyList();
        }
        AtomicReference<List<BufferedChange>> result = new AtomicReference<>(Collections.emptyList());
        layerMap.compute(layer, (k, queue) -> {
            if (queue == null || queue.isEmpty()) {
                return queue;
            }
            result.set(new ArrayList<>(queue));
            return new ConcurrentLinkedQueue<>();
        });
        return result.get();
    }

    /**
     * Drains all layers for the given URI, returning changes in layer-priority order:
     * EDITOR first, then AI, then EXPR.
     *
     * @param uri document identity
     * @return unmodifiable list of drained changes across all layers, empty if none
     */
    public List<BufferedChange> drain(DocumentUri uri) {
        List<BufferedChange> all = new ArrayList<>();
        for (ChangeLayer layer : ChangeLayer.values()) {
            all.addAll(drain(uri, layer));
        }
        return all;
    }

    /**
     * Removes all buffered changes for the given URI across all layers.
     *
     * @param uri document identity
     */
    public void clear(DocumentUri uri) {
        layeredChanges.remove(uri);
    }

    /**
     * Removes all buffered changes for URIs whose path starts with the given root path prefix.
     * Used during project eviction to clean up all document entries under a source root.
     *
     * @param rootPath the source root path prefix (from {@code URI.getPath()})
     */
    public void clearSubtree(String rootPath) {
        layeredChanges.keySet().removeIf(uri -> uri.uri().getPath().startsWith(rootPath));
        closedDocChanges.keySet().removeIf(uri -> uri.uri().getPath().startsWith(rootPath));
        deferredWatcherEvents.keySet().removeIf(uri -> uri.uri().getPath().startsWith(rootPath));
    }

    /**
     * Returns {@code true} if any layer has pending changes for the given URI.
     *
     * @param uri document identity
     * @return {@code true} when at least one change is buffered
     */
    public boolean hasChanges(DocumentUri uri) {
        ConcurrentHashMap<ChangeLayer, ConcurrentLinkedQueue<BufferedChange>> layerMap = layeredChanges.get(uri);
        if (layerMap == null) {
            return false;
        }
        for (ConcurrentLinkedQueue<BufferedChange> queue : layerMap.values()) {
            if (!queue.isEmpty()) {
                return true;
            }
        }
        return false;
    }

    /**
     * Returns {@code true} if the given URI has an entry for the requested layer, even if
     * that layer's queue was drained and is currently empty.
     *
     * @param uri document identity
     * @param layer overlay layer
     * @return {@code true} when the layer is present
     */
    public boolean hasLayer(DocumentUri uri, ChangeLayer layer) {
        ConcurrentHashMap<ChangeLayer, ConcurrentLinkedQueue<BufferedChange>> layerMap = layeredChanges.get(uri);
        return layerMap != null && layerMap.containsKey(layer);
    }

    /**
     * Returns the set of URIs that currently have pending layered changes.
     *
     * @return pending URI set
     */
    public Set<DocumentUri> pendingUris() {
        Set<DocumentUri> result = new HashSet<>();
        for (Map.Entry<DocumentUri, ConcurrentHashMap<ChangeLayer, ConcurrentLinkedQueue<BufferedChange>>> entry
                : layeredChanges.entrySet()) {
            for (ConcurrentLinkedQueue<BufferedChange> queue : entry.getValue().values()) {
                if (!queue.isEmpty()) {
                    result.add(entry.getKey());
                    break;
                }
            }
        }
        return result;
    }

    /**
     * Routes a file watcher event to the correct map based on whether the document is open.
     *
     * <p>Open detection: URI has an EDITOR layer entry (even if the queue is currently empty after
     * a drain — the key still exists). Routes to {@code deferredWatcherEvents} when open;
     * routes to {@code closedDocChanges} when closed.
     *
     * @param uri   document identity
     * @param event the file watcher event to route
     */
    public void routeWatcherEvent(DocumentUri uri, FileEvent event) {
        if (isOpen(uri)) {
            deferredWatcherEvents.put(uri, event);
        } else {
            closedDocChanges.put(uri, event);
        }
    }

    /**
     * Atomically returns all pending closed-document watcher events and clears the map.
     *
     * @return snapshot of all closed-doc watcher events, empty if none
     */
    public Map<DocumentUri, FileEvent> drainClosedDocChanges() {
        if (closedDocChanges.isEmpty()) {
            return Collections.emptyMap();
        }
        Map<DocumentUri, FileEvent> snapshot = new HashMap<>(closedDocChanges);
        // Per-entry conditional removal: only the value actually captured in the snapshot is
        // removed. A put() racing between the snapshot copy and removal (for the same URI) leaves
        // its newer value in place for the next drain instead of being silently dropped.
        for (Map.Entry<DocumentUri, FileEvent> entry : snapshot.entrySet()) {
            closedDocChanges.remove(entry.getKey(), entry.getValue());
        }
        return snapshot;
    }

    /**
     * Atomically returns all deferred watcher events (for open documents) and clears the map.
     *
     * @return snapshot of all deferred watcher events, empty if none
     */
    public Map<DocumentUri, FileEvent> drainDeferredWatcherEvents() {
        if (deferredWatcherEvents.isEmpty()) {
            return Collections.emptyMap();
        }
        Map<DocumentUri, FileEvent> snapshot = new HashMap<>(deferredWatcherEvents);
        // Per-entry conditional removal — see drainClosedDocChanges for rationale.
        for (Map.Entry<DocumentUri, FileEvent> entry : snapshot.entrySet()) {
            deferredWatcherEvents.remove(entry.getKey(), entry.getValue());
        }
        return snapshot;
    }

    /**
     * Returns {@code true} if the given URI has an active EDITOR layer (i.e., document is open).
     * The EDITOR layer key presence — not queue emptiness — determines open state.
     *
     * <p>Note: after {@link #drain(DocumentUri, ChangeLayer)} the queue is replaced with an empty
     * queue (the key remains), so a recently-drained EDITOR layer still counts as open. After
     * {@link #clear(DocumentUri)} or after the EDITOR layer key is explicitly removed, the document
     * is considered closed.
     *
     * @param uri document identity
     * @return {@code true} if EDITOR layer key exists for this URI
     */
    public boolean isOpen(DocumentUri uri) {
        ConcurrentHashMap<ChangeLayer, ConcurrentLinkedQueue<BufferedChange>> layerMap = layeredChanges.get(uri);
        return layerMap != null && layerMap.containsKey(ChangeLayer.EDITOR);
    }
}
