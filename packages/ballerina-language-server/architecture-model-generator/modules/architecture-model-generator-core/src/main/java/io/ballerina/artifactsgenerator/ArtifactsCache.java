/*
 *  Copyright (c) 2025, WSO2 LLC. (http://www.wso2.com)
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

package io.ballerina.artifactsgenerator;

import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.locks.Lock;
import java.util.concurrent.locks.ReentrantLock;

/**
 * Singleton cache for storing project artifacts. This class provides thread-safe access to artifact IDs mapped by
 * project ID and file URI.
 *
 * @since 1.0.0
 */
public class ArtifactsCache {

    private static ArtifactsCache instance;

    // Map: project_id → document id -> category -> artifact ids
    private final ConcurrentMap<String, ConcurrentMap<String, Map<String, List<String>>>> projectCache;

    // Map: project_id:file_uri → lock
    private final ConcurrentMap<String, Lock> locks;

    // Map: project_id:module_name → documents whose artifacts depend on another document's, see TcpConnectionLinks
    private final ConcurrentMap<String, Set<String>> linkedDocuments;

    // Map: project_id:file_uri → generation of the snapshot the document's cached artifacts were generated from
    private final ConcurrentMap<String, Long> documentGenerations;

    private final AtomicLong generations;

    private ArtifactsCache() {
        projectCache = new ConcurrentHashMap<>();
        locks = new ConcurrentHashMap<>();
        linkedDocuments = new ConcurrentHashMap<>();
        documentGenerations = new ConcurrentHashMap<>();
        generations = new AtomicLong();
    }

    /**
     * Initializes the singleton instance of ArtifactsCache.
     */
    public static void initialize() {
        instance = new ArtifactsCache();
    }

    /**
     * Gets the singleton instance of ArtifactsCache.
     *
     * @return The singleton instance
     */
    public static ArtifactsCache getInstance() {
        return instance;
    }

    private Lock getOrCreateLock(String projectId, String fileUri) {
        String lockKey = projectId + ":" + fileUri;
        return locks.computeIfAbsent(lockKey, k -> new ReentrantLock());
    }

    /**
     * Checks if a project exists in the cache.
     *
     * @param projectId The project ID
     * @return true if the project exists, false otherwise
     */
    public boolean hasInitialized(String projectId) {
        return projectCache.containsKey(projectId);
    }

    public void initializeProject(String projectId,
                                  ConcurrentMap<String, Map<String, List<String>>> documentMap) {
        projectCache.put(projectId, documentMap);
    }

    /**
     * Gets artifact IDs for a given file URI within a project. This method acquires a lock that must be released by
     * calling updateArtifactIds.
     *
     * @param projectId The project ID
     * @param fileUri   The file URI
     * @return List of artifact IDs, or empty list if not found
     */
    public Map<String, List<String>> getArtifactIds(String projectId, String fileUri) {
        Lock lock = getOrCreateLock(projectId, fileUri);
        lock.lock();

        ConcurrentMap<String, Map<String, List<String>>> documentMap = projectCache.get(projectId);
        if (documentMap == null) {
            return Collections.emptyMap();
        }

        Map<String, List<String>> artifactIds = documentMap.get(fileUri);
        if (artifactIds == null) {
            return Collections.emptyMap();
        }

        return artifactIds;
    }

    /**
     * Adds or updates artifact IDs for a file URI within a project. This method releases the lock acquired by
     * getArtifactIds.
     *
     * @param projectId   The project ID
     * @param fileUri     The file URI
     * @param artifactIds The list of artifact IDs
     */
    public void updateArtifactIds(String projectId, String fileUri, Map<String, List<String>> artifactIds) {
        try {
            // Get or create document map for project
            ConcurrentMap<String, Map<String, List<String>>> documentMap =
                    projectCache.computeIfAbsent(projectId, k -> new ConcurrentHashMap<>());
            documentMap.put(fileUri, artifactIds);
        } finally {
            // Release the lock acquired in getArtifactIds
            Lock lock = getOrCreateLock(projectId, fileUri);
            lock.unlock();
        }
    }

    /**
     * Stamps a snapshot of the project, in the order the snapshots were taken. A later snapshot gets a higher
     * generation.
     *
     * @return The generation of the snapshot
     */
    public long nextGeneration() {
        return generations.incrementAndGet();
    }

    /**
     * Whether a document's cached artifacts were generated from a snapshot newer than the given one. Call it while
     * holding the document's lock, taken by getArtifactIds.
     *
     * @param projectId  The project ID
     * @param fileUri    The file URI
     * @param generation The generation of the snapshot about to be used
     * @return true if a newer snapshot already generated the document's artifacts
     */
    public boolean hasNewerGeneration(String projectId, String fileUri, long generation) {
        Long cached = documentGenerations.get(projectId + ":" + fileUri);
        return cached != null && cached > generation;
    }

    /**
     * Adds or updates artifact IDs for a file URI, generated from the snapshot of the given generation, and releases
     * the lock acquired by getArtifactIds.
     *
     * @param projectId   The project ID
     * @param fileUri     The file URI
     * @param artifactIds The list of artifact IDs
     * @param generation  The generation of the snapshot the artifacts were generated from
     */
    public void updateArtifactIds(String projectId, String fileUri, Map<String, List<String>> artifactIds,
                                  long generation) {
        try {
            documentGenerations.merge(projectId + ":" + fileUri, generation, Math::max);
        } finally {
            updateArtifactIds(projectId, fileUri, artifactIds);
        }
    }

    /**
     * Records the documents of a module whose artifacts depend on another document's, in one step with reading the
     * ones recorded before, so concurrent changes each see the record the other left.
     *
     * @param projectId  The project ID
     * @param moduleName The module name
     * @param documents  The linked documents
     * @return The linked documents recorded before, or an empty set if none were
     */
    public Set<String> recordLinkedDocuments(String projectId, String moduleName, Set<String> documents) {
        Set<String> previous = linkedDocuments.put(linkedDocumentsKey(projectId, moduleName), Set.copyOf(documents));
        return previous == null ? Set.of() : previous;
    }

    private static String linkedDocumentsKey(String projectId, String moduleName) {
        return projectId + ":" + moduleName;
    }

    /**
     * Gets all artifact IDs for a project organized by document.
     *
     * @param projectId The project ID
     * @return Map of document ID to artifact categories and IDs, or empty map if project not found
     */
    public Map<String, Map<String, List<String>>> getProjectDocuments(String projectId) {
        ConcurrentMap<String, Map<String, List<String>>> documentMap = projectCache.get(projectId);
        if (documentMap == null) {
            return Collections.emptyMap();
        }
        return documentMap;
    }
}
