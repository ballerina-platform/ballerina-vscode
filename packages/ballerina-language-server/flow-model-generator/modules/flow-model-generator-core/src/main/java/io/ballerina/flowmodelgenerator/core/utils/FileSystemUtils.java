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

package io.ballerina.flowmodelgenerator.core.utils;

import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.flowmodelgenerator.core.model.Codedata;
import io.ballerina.modelgenerator.commons.PackageUtil;
import io.ballerina.projects.Document;
import io.ballerina.projects.Package;
import io.ballerina.projects.Project;
import io.ballerina.projects.ProjectException;
import org.ballerinalang.langserver.commons.eventsync.exceptions.EventSyncException;
import org.ballerinalang.langserver.commons.workspace.WorkspaceDocumentException;
import org.ballerinalang.langserver.commons.workspace.WorkspaceManager;
import org.eclipse.lsp4j.DidOpenTextDocumentParams;
import org.eclipse.lsp4j.FileChangeType;
import org.eclipse.lsp4j.FileEvent;
import org.eclipse.lsp4j.TextDocumentItem;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.Optional;

/**
 * A utility class for file system operations interacting with the Ballerina language server.
 *
 * <p>
 * This functionality should be moved to the {@link WorkspaceManager} to decouple the file system operations from the
 * language server.
 * </p>
 *
 * @since 1.0.0
 */
public class FileSystemUtils {

    private static final List<Path> CREATED_FILES = new ArrayList<>();

    /**
     * Retrieves a document from the workspace manager for the given file path. If the file does not exist, it creates a
     * new file and returns the corresponding document.
     *
     * @param workspaceManager The workspace manager to retrieve or create the document
     * @param filePath         The path to the file for which the document is required
     * @return The document corresponding to the specified file path
     * @throws RuntimeException If there's an error creating the file when it doesn't exist
     */
    public static Document getDocument(WorkspaceManager workspaceManager, Path filePath) {
        Document document;
        try {
            // Create the file on disk first so that ProjectPaths.packageRoot() can locate the package root.
            // Without this, workspaceManager.document() throws ProjectException (not NoSuchElementException)
            // for non-existent files, bypassing the catch block below.
            if (!Files.exists(filePath)) {
                Files.createFile(filePath);
                CREATED_FILES.add(filePath);
            }
            document = workspaceManager.document(filePath).orElseThrow();
        } catch (NoSuchElementException e) {
            // File exists on disk but is not yet loaded in the workspace; load it via didOpen.
            // This works in both production and test environments, unlike didChangeWatched which is
            // disabled when the file watcher is off.
            try {
                String content = Files.readString(filePath);
                TextDocumentItem textDocumentItem = new TextDocumentItem();
                textDocumentItem.setUri(filePath.toUri().toString());
                textDocumentItem.setLanguageId("ballerina");
                textDocumentItem.setVersion(1);
                textDocumentItem.setText(content);
                workspaceManager.didOpen(filePath, new DidOpenTextDocumentParams(textDocumentItem));
                document = workspaceManager.document(filePath).orElseThrow(
                        () -> new WorkspaceDocumentException("Error occurred while loading the file: " + filePath));
            } catch (IOException | WorkspaceDocumentException fileLoadException) {
                throw new RuntimeException("Error occurred while loading the file: " + filePath,
                        fileLoadException);
            }
        } catch (IOException e) {
            throw new RuntimeException("Error occurred while creating the file: " + filePath, e);
        }
        return document;
    }

    /**
     * Retrieves the semantic model for the specified file path.
     * <p>
     * This method first attempts to get the semantic model directly associated with the file path. If that fails, it
     * falls back to the semantic model of the default module from the project containing the file path.
     *
     * @param workspaceManager The workspace manager used to access semantic models
     * @param filePath         The path of the file for which to retrieve the semantic model
     * @return The semantic model for the file path
     * @throws RuntimeException if the project cannot be found for the given file path
     */
    public static SemanticModel getSemanticModel(WorkspaceManager workspaceManager, Path filePath) {
        Optional<SemanticModel> optionalSemanticModel = workspaceManager.semanticModel(filePath);
        if (optionalSemanticModel.isPresent()) {
            return optionalSemanticModel.get();
        }

        // Obtain the default semantic model if not exists
        Project project = workspaceManager.project(filePath).orElseThrow();
        Package currentPackage = project.currentPackage();
        return PackageUtil.getCompilation(currentPackage)
                .getSemanticModel(currentPackage.getDefaultModule().moduleId());
    }

    /**
     * Creates a file at the specified path if it does not already exist in the workspace.
     * <p>
     * This method first attempts to load the project containing the specified file. If the project loads successfully,
     * it means the file already exists. If a ProjectException is thrown, it indicates the file does not exist, and the
     * method creates it.
     *
     * @param workspaceManager The workspace manager to use for project loading and file operations
     * @param filePath         The path where the file should be created if it doesn't exist
     * @throws RuntimeException If an error occurs during project loading or file creation
     */
    public static void createFileIfNotExists(WorkspaceManager workspaceManager, Path filePath) {
        try {
            workspaceManager.loadProject(filePath);
        } catch (WorkspaceDocumentException | EventSyncException e) {
            throw new RuntimeException(e);
        } catch (ProjectException e) {
            // Create a new file as it does not exist
            try {
                Files.createFile(filePath);
                CREATED_FILES.add(filePath);
                FileEvent fileEvent = new FileEvent(filePath.toUri().toString(), FileChangeType.Created);
                workspaceManager.didChangeWatched(filePath, fileEvent);
            } catch (IOException | WorkspaceDocumentException fileCreationException) {
                throw new RuntimeException("Error occurred while creating the file: " + filePath,
                        fileCreationException);
            }
        }
    }

    /**
     * Resolves the file path based on the provided codedata and project root.
     * <p>
     * If the codedata does not have a line range, returns the project root. Otherwise, resolves the file path by
     * combining the project root with the filename from the codedata's line range.
     *
     * @param codedata    The codedata containing file information
     * @param projectRoot The project root path
     * @return The resolved file path
     */
    public static Path resolveFilePathFromCodedata(Codedata codedata, Path projectRoot) {
        if (codedata.lineRange() != null) {
            String fileName = codedata.lineRange().fileName();
            Path actualProjectRoot = projectRoot;
            if (Files.isRegularFile(projectRoot)) {
                Path parent = projectRoot.getParent();
                if (parent != null) {
                    actualProjectRoot = parent;
                }
            }
            return actualProjectRoot.resolve(fileName);
        }
        return projectRoot;
    }

    /**
     * Deletes all files created by this utility class during testing.
     * <p>
     * This method is intended to be used in test cleanup to ensure temporary files created during tests are properly
     * removed from the file system.
     *
     * @throws RuntimeException If an error occurs while deleting any of the files
     */
    public static void deleteCreatedFiles() {
        CREATED_FILES.forEach(path -> {
            try {
                Files.deleteIfExists(path);
            } catch (IOException e) {
                throw new RuntimeException("Error occurred while deleting the file: " + path, e);
            }
        });
    }
}
