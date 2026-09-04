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

package io.ballerina.artifactsgenerator.codemap;

import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.compiler.syntax.tree.Node;
import io.ballerina.compiler.syntax.tree.SyntaxTree;
import io.ballerina.projects.Document;
import io.ballerina.projects.DocumentId;
import io.ballerina.projects.Module;
import io.ballerina.projects.ModuleId;
import io.ballerina.projects.Package;
import io.ballerina.projects.Project;
import io.ballerina.tools.diagnostics.Diagnostic;
import org.ballerinalang.langserver.commons.BallerinaCompilerApi;
import org.ballerinalang.langserver.commons.workspace.WorkspaceManager;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

/**
 * Generates codeMap from Ballerina projects by extracting artifacts from source files.
 * @since 1.8.0
 */
public class CodeMapGenerator {

    /**
     * Generates a codeMap for all files in the given project.
     *
     * @param project          the Ballerina project
     * @param workspaceManager the workspace manager to obtain semantic models
     * @return a map of relative file paths to their codeMap files
     */
    public static Map<String, CodeMapFile> generateCodeMap(Project project, WorkspaceManager workspaceManager) {
        Package currentPackage = project.currentPackage();
        Map<String, CodeMapFile> codeMapFiles = new LinkedHashMap<>();

        var sortedModules = currentPackage.moduleIds()
                .stream()
                .sorted(Comparator.comparing(moduleId -> {
                    Module m = currentPackage.module(moduleId);
                    return m.isDefaultModule() ? "" : m.moduleName().moduleNamePart();
                }))
                .collect(Collectors.toList());

        for (ModuleId moduleId : sortedModules) {
            Module module = currentPackage.module(moduleId);

            List<DocumentId> sortedDocs = module.documentIds()
                    .stream()
                    .sorted(Comparator.comparing(docId -> module.document(docId).name()))
                    .collect(Collectors.toList());

            for (DocumentId documentId : sortedDocs) {
                Document document = module.document(documentId);
                String relativeFilePath = getRelativeFilePath(module, document.name());

                SyntaxTree syntaxTree = document.syntaxTree();
                List<CodeMapArtifact> artifacts = collectArtifactsFromSyntaxTree(syntaxTree);

                CodeMapFile codeMapFile = new CodeMapFile(artifacts);
                codeMapFiles.put(relativeFilePath, codeMapFile);
            }
        }

        return codeMapFiles;
    }

    /**
     * Renders consolidated markdown content for the given package codeMap.
     *
     * @param project          the Ballerina project
     * @param workspaceManager the workspace manager
     * @return consolidated project markdown content
     */
    public static String renderPackageMarkdown(Project project, WorkspaceManager workspaceManager) {
        Map<String, CodeMapFile> codeMapFiles = generateCodeMap(project, workspaceManager);

        String projectName = project.currentPackage().packageName().value();

        return CodeMapMarkdownGenerator.generatePackageMarkdown(codeMapFiles, projectName);
    }

    /**
     * Renders consolidated markdown content for all packages in the workspace codeMap.
     *
     * @param project          the Ballerina workspace project
     * @param workspaceManager the workspace manager
     * @return consolidated workspace markdown content
     */
    public static String renderWorkspaceMarkdown(Project project, WorkspaceManager workspaceManager) {
        Map<String, Map<String, CodeMapFile>> workspaceCodeMap = new LinkedHashMap<>();
        BallerinaCompilerApi compilerApi = BallerinaCompilerApi.getInstance();

        // For a single-package project, treat it as a one-entry workspace
        if (!compilerApi.isWorkspaceProject(project)) {
            String packageName = project.currentPackage().packageName().value();
            workspaceCodeMap.put(packageName, generateCodeMap(project, workspaceManager));
        } else {
            // Iterate packages in dependency order to preserve build ordering
            List<Project> workspaceProjects = compilerApi.getWorkspaceProjectsInOrder(project);
            for (Project packageProject : workspaceProjects) {
                String packageName = packageProject.currentPackage().packageName().value();
                workspaceCodeMap.put(packageName, generateCodeMap(packageProject, workspaceManager));
            }
        }

        // Derive workspace name from the source root directory
        Path sourceRoot = project.sourceRoot();
        String workspaceName = "Unknown Workspace";
        if (sourceRoot != null) {
            Path fileName = sourceRoot.getFileName();
            if (fileName != null) {
                workspaceName = fileName.toString();
            }
        }

        return CodeMapMarkdownGenerator.generateWorkspaceMarkdown(workspaceCodeMap, workspaceName);
    }

    private static List<CodeMapArtifact> collectArtifactsFromSyntaxTree(SyntaxTree syntaxTree) {
        List<CodeMapArtifact> artifacts = new ArrayList<>();

        if (syntaxTree.hasDiagnostics()) {
            artifacts.addAll(createSyntaxErrorArtifacts(syntaxTree.diagnostics(), syntaxTree));
        }

        if (!syntaxTree.containsModulePart()) {
            return artifacts;
        }

        ModulePartNode rootNode = syntaxTree.rootNode();
        CodeMapNodeTransformer codeMapNodeTransformer = new CodeMapNodeTransformer();

        // Process imports individually with per-node error handling
        rootNode.imports().forEach(importNode -> addArtifactSafely(importNode, codeMapNodeTransformer, artifacts));

        // Process members individually with per-node error handling
        rootNode.members().forEach(member -> addArtifactSafely(member, codeMapNodeTransformer, artifacts));
        return artifacts;
    }

    private static List<CodeMapArtifact> createSyntaxErrorArtifacts(Iterable<Diagnostic> diagnostics,
                                                                    SyntaxTree syntaxTree) {
        List<CodeMapArtifact> syntaxErrorArtifacts = new ArrayList<>();

        for (Diagnostic diagnostic : diagnostics) {
            Map<String, Object> properties = new HashMap<>();
            properties.put("diagnosticMessage", diagnostic.message());
            properties.put("severity", diagnostic.diagnosticInfo().severity().toString());
            properties.put("code", diagnostic.diagnosticInfo().code());

            String rawCode = extractRawCodeFromDiagnostic(diagnostic, syntaxTree);
            if (rawCode != null && !rawCode.trim().isEmpty()) {
                properties.put("rawCode", rawCode);
            }

            syntaxErrorArtifacts.add(new CodeMapArtifact(
                    "Syntax Error",
                    "SYNTAX_ERROR",
                    CodeMapArtifact.toRange(diagnostic.location().lineRange()),
                    properties,
                    Collections.emptyList()
            ));
        }

        return syntaxErrorArtifacts;
    }

    private static String extractRawCodeFromDiagnostic(Diagnostic diagnostic, SyntaxTree syntaxTree) {
        String sourceText = syntaxTree.toSourceCode();
        if (sourceText == null || sourceText.isEmpty()) {
            return null;
        }
        String[] lines = sourceText.split("\\r?\\n");

        int startLine = diagnostic.location().lineRange().startLine().line();
        int endLine = diagnostic.location().lineRange().endLine().line();

        if (startLine < 0 || startLine >= lines.length || endLine < startLine) {
            return null;
        }

        int safeEndLine = Math.min(endLine, lines.length - 1);
        StringBuilder codeBuilder = new StringBuilder();
        for (int i = startLine; i <= safeEndLine; i++) {
            if (i > startLine) {
                codeBuilder.append("\n");
            }
            codeBuilder.append(lines[i]);
        }

        return codeBuilder.toString().trim();
    }

    private static boolean hasErrorInNode(Node node) {
        if (node == null || node.hasDiagnostics()) {
            return true;
        }
        String sourceText = node.toSourceCode();
        if (sourceText == null || sourceText.trim().isEmpty()) {
            return true;
        }
        return sourceText.contains("MISSING") || sourceText.contains("[error]");
    }

    private static void addArtifactSafely(Node node, CodeMapNodeTransformer transformer,
                                          List<CodeMapArtifact> artifacts) {
        if (hasErrorInNode(node)) {
            return;
        }
        Optional<CodeMapArtifact> artifact = node.apply(transformer);
        artifact.ifPresent(artifacts::add);
    }

    // Gets relative file path considering module structure
    private static String getRelativeFilePath(Module module, String fileName) {
        if (module.isDefaultModule()) {
            return fileName;
        }
        String moduleName = module.moduleName().moduleNamePart();
        return "modules/" + moduleName + "/" + fileName;
    }

}

