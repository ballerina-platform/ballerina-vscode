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

import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.compiler.syntax.tree.SyntaxTree;
import io.ballerina.modelgenerator.commons.PackageUtil;
import io.ballerina.projects.Document;
import io.ballerina.projects.Module;
import io.ballerina.projects.Package;
import io.ballerina.projects.Project;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeMap;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

/**
 * Generator class responsible for creating artifacts from a Ballerina syntax tree. This class analyzes the module
 * members in a syntax tree to extract artifact information.
 *
 * @since 1.0.0
 */
public class ArtifactsGenerator {

    private static final String ADDITIONS = "additions";
    private static final String UPDATES = "updates";
    private static final String DELETIONS = "deletions";

    public static Map<String, Map<String, Map<String, Artifact>>> artifactChanges(String projectPath,
                                                                                  SyntaxTree syntaxTree,
                                                                                  SemanticModel semanticModel) {
        return artifactChanges(projectPath, syntaxTree, semanticModel, null);
    }

    /**
     * Computes the artifact changes caused by a change to one document.
     * <p>
     * A document's artifacts can depend on another document: a TCP service lists the handlers of a connection
     * service class declared elsewhere, and that class is then left out of Types. So when the changed document was,
     * or now is, on either side of such a pair, every linked document is regenerated with it. Any other change
     * regenerates the changed document alone.
     *
     * @param projectPath   the project path
     * @param syntaxTree    the syntax tree of the changed document
     * @param semanticModel the semantic model of the document's module
     * @param module        the document's module, or null to look no further than the changed document
     * @return the artifact changes, by category and event type
     */
    public static Map<String, Map<String, Map<String, Artifact>>> artifactChanges(String projectPath,
                                                                                  SyntaxTree syntaxTree,
                                                                                  SemanticModel semanticModel,
                                                                                  Module module) {
        if (!syntaxTree.containsModulePart()) {
            return Map.of();
        }

        ArtifactsCache cache = ArtifactsCache.getInstance();
        TcpConnectionLinks links = TcpConnectionLinks.of(module, syntaxTree, semanticModel);
        Set<String> documents = TcpConnectionLinks.withLinkedDocuments(syntaxTree.filePath(),
                cache.getLinkedDocuments(projectPath), links.documents());
        cache.recordLinkedDocuments(projectPath, links.documents());

        Map<String, Map<String, Map<String, Artifact>>> categoryMap = new HashMap<>();
        // One document at a time: each holds its cache lock only while it is regenerated, so no two locks are ever
        // held together and concurrent changes cannot deadlock on each other's documents.
        documents.stream().sorted().forEach(document -> links.syntaxTree(document).ifPresent(documentTree ->
                addDocumentChanges(projectPath, documentTree, semanticModel, links, categoryMap)));
        return categoryMap;
    }

    private static void addDocumentChanges(String projectPath, SyntaxTree syntaxTree, SemanticModel semanticModel,
                                           TcpConnectionLinks links,
                                           Map<String, Map<String, Map<String, Artifact>>> categoryMap) {
        Map<String, List<String>> prevIdMap = new HashMap<>(
                ArtifactsCache.getInstance().getArtifactIds(projectPath, syntaxTree.filePath()));
        Map<String, List<String>> newIdMap = new HashMap<>();

        List<Artifact> artifacts = collectArtifactsFromSyntaxTree(projectPath, syntaxTree, semanticModel, links);
        artifacts.forEach(artifact -> {
            String category = Artifact.getCategory(artifact.type());
            String artifactId = artifact.id();

            // Determine if this is an update or an addition
            String eventType = determineEventTypeAndRemove(prevIdMap.get(category), artifactId);

            // Update the new artifact using helper
            putArtifactInMap(categoryMap, category, eventType, artifactId, artifact);
            newIdMap.computeIfAbsent(category, k -> new ArrayList<>()).add(artifactId);
        });

        // Process remaining items in prevIdMap as deletions
        addDeletionsToCategoryMap(categoryMap, prevIdMap);

        // Update the artifacts cache
        ArtifactsCache.getInstance().updateArtifactIds(projectPath, syntaxTree.filePath(), newIdMap);
    }

    public static Map<String, Map<String, Artifact>> artifacts(Project project) {
        Package currentPackage = project.currentPackage();
        Module defaultModule = currentPackage.getDefaultModule();
        SemanticModel semanticModel =
                PackageUtil.getCompilation(currentPackage).getSemanticModel(defaultModule.moduleId());

        Map<String, Map<String, Artifact>> artifactMap = new ConcurrentHashMap<>();
        ConcurrentMap<String, Map<String, List<String>>> documentMap = new ConcurrentHashMap<>();
        TcpConnectionLinks links = TcpConnectionLinks.of(defaultModule, null, semanticModel);
        defaultModule.documentIds().stream().parallel().forEach(documentId -> {
            Document document = defaultModule.document(documentId);
            Map<String, List<String>> idMap = new HashMap<>();
            SyntaxTree syntaxTree = document.syntaxTree();
            String projectPath = project.sourceRoot().toAbsolutePath().toString();
            List<Artifact> artifacts = collectArtifactsFromSyntaxTree(projectPath, syntaxTree, semanticModel, links);
            artifacts.forEach(artifact -> {
                String category = Artifact.getCategory(artifact.type());
                String artifactId = artifact.id();
                artifactMap.computeIfAbsent(category, k -> new TreeMap<>()).put(artifactId, artifact);
                idMap.computeIfAbsent(category, k -> new ArrayList<>()).add(artifactId);
            });
            documentMap.put(document.name(), idMap);
        });

        ArtifactsCache.getInstance().initializeProject(project.sourceRoot().toString(), documentMap);
        ArtifactsCache.getInstance().recordLinkedDocuments(project.sourceRoot().toString(), links.documents());
        return artifactMap;
    }

    public static Map<String, Map<String, Map<String, Artifact>>> projectArtifactChanges(Project project) {
        String projectId = project.sourceRoot().toString();
        Package currentPackage = project.currentPackage();
        Module defaultModule = currentPackage.getDefaultModule();
        SemanticModel semanticModel =
                PackageUtil.getCompilation(currentPackage).getSemanticModel(defaultModule.moduleId());

        // Process each document in parallel to calculate deltas
        Map<String, Map<String, List<String>>> cachedArtifactsByDocument =
                ArtifactsCache.getInstance().getProjectDocuments(projectId);
        ConcurrentMap<String, Map<String, Map<String, Artifact>>> combinedDeltas = new ConcurrentHashMap<>();
        ConcurrentMap<String, Map<String, List<String>>> newDocumentMap = new ConcurrentHashMap<>();
        TcpConnectionLinks links = TcpConnectionLinks.of(defaultModule, null, semanticModel);
        defaultModule.documentIds().stream().parallel().forEach(documentId -> {
            Document document = defaultModule.document(documentId);
            String documentName = document.name();
            SyntaxTree syntaxTree = document.syntaxTree();

            // Get cached artifacts for this document
            Map<String, List<String>> cachedArtifactsForDoc = cachedArtifactsByDocument.getOrDefault(
                    documentName, new HashMap<>());

            // Generate new artifacts for this document
            Map<String, List<String>> newArtifactsForDoc = new HashMap<>();
            Map<String, Map<String, Map<String, Artifact>>> documentDeltas = new HashMap<>();

            String projectPath = project.sourceRoot().toAbsolutePath().toString();
            List<Artifact> artifacts = collectArtifactsFromSyntaxTree(projectPath, syntaxTree, semanticModel, links);
            artifacts.forEach(artifact -> {
                String category = Artifact.getCategory(artifact.type());
                String artifactId = artifact.id();

                // Determine if this is an update or an addition
                List<String> cachedIds = new ArrayList<>(
                        cachedArtifactsForDoc.getOrDefault(category, new ArrayList<>()));
                String eventType = determineEventTypeAndRemove(cachedIds, artifactId);

                // Add to document deltas using helper
                putArtifactInMap(documentDeltas, category, eventType, artifactId, artifact);

                // Track new artifacts for cache update
                newArtifactsForDoc.computeIfAbsent(category, k -> new ArrayList<>()).add(artifactId);
                cachedArtifactsForDoc.put(category, cachedIds);
            });

            // Process remaining cached artifacts as deletions
            addDeletionsToCategoryMap(documentDeltas, cachedArtifactsForDoc);

            // Store new artifacts for cache update
            newDocumentMap.put(documentName, newArtifactsForDoc);

            // Combine document deltas into combined result
            combineDeltas(combinedDeltas, documentDeltas);
        });

        // Update cache with new project artifacts
        ArtifactsCache.getInstance().initializeProject(projectId, newDocumentMap);
        ArtifactsCache.getInstance().recordLinkedDocuments(projectId, links.documents());
        return combinedDeltas;
    }

    private static List<Artifact> collectArtifactsFromSyntaxTree(String projectPath, SyntaxTree syntaxTree,
                                                                 SemanticModel semanticModel,
                                                                 TcpConnectionLinks links) {
        List<Artifact> artifacts = new ArrayList<>();
        if (!syntaxTree.containsModulePart()) {
            return artifacts;
        }
        ModulePartNode rootNode = syntaxTree.rootNode();
        ModuleNodeTransformer moduleNodeTransformer = new ModuleNodeTransformer(projectPath, semanticModel, links);
        rootNode.members().stream()
                .map(member -> member.apply(moduleNodeTransformer))
                .flatMap(Optional::stream)
                .forEach(artifacts::add);
        return artifacts;
    }

    // New helpers to remove duplicated logic
    private static String determineEventTypeAndRemove(List<String> ids, String artifactId) {
        if (ids != null && ids.remove(artifactId)) {
            return UPDATES;
        }
        return ADDITIONS;
    }

    private static void putArtifactInMap(Map<String, Map<String, Map<String, Artifact>>> categoryMap,
                                         String category,
                                         String eventType,
                                         String artifactId,
                                         Artifact artifact) {
        categoryMap.computeIfAbsent(category, k -> new HashMap<>())
                .computeIfAbsent(eventType, k -> new HashMap<>())
                .put(artifactId, artifact);
    }

    private static void addDeletionsToCategoryMap(Map<String, Map<String, Map<String, Artifact>>> categoryMap,
                                                  Map<String, List<String>> idsMap) {
        idsMap.forEach((category, remainingIds) -> {
            if (!remainingIds.isEmpty()) {
                remainingIds.forEach(id -> categoryMap
                        .computeIfAbsent(category, k -> new HashMap<>())
                        .computeIfAbsent(DELETIONS, k -> new HashMap<>())
                        .put(id, Artifact.emptyArtifact(id)));
            }
        });
    }

    private static void combineDeltas(ConcurrentMap<String, Map<String, Map<String, Artifact>>> combinedDeltas,
                                      Map<String, Map<String, Map<String, Artifact>>> documentDeltas) {
        documentDeltas.forEach((category, eventTypeMap) ->
                eventTypeMap.forEach((eventType, artifactMap) ->
                        artifactMap.forEach((artifactId, artifact) ->
                                combinedDeltas.computeIfAbsent(category, k -> new ConcurrentHashMap<>())
                                        .computeIfAbsent(eventType, k -> new ConcurrentHashMap<>())
                                        .put(artifactId, artifact))));
    }
}
