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

package org.ballerinalang.langserver.workspace.workspacemanager;

import io.ballerina.projects.Module;
import io.ballerina.projects.Project;
import org.ballerinalang.langserver.workspace.workspacemanager.change.ChangeBuffer;
import org.ballerinalang.langserver.workspace.workspacemanager.uri.DocumentUri;
import org.eclipse.lsp4j.FileEvent;
import org.eclipse.lsp4j.TextDocumentContentChangeEvent;
import org.eclipse.lsp4j.jsonrpc.CancelChecker;

import java.nio.file.Path;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

import javax.annotation.Nonnull;

/**
 * Project context service contract.
 *
 * @since 1.7.0
 */
public interface ProjectService {

    /**
     * Loads or creates a project for the provided path.
     *
     * @param path path to resolve
     * @param cancelChecker cancel checker
     * @return resolved project
     */
    Project loadOrCreate(Path path, CancelChecker cancelChecker);

    /**
     * Returns a currently cached project for the provided path without loading from disk.
     *
     * @param path path to resolve
     * @return cached project, if one is already registered
     */
    @Nonnull
    Optional<Project> project(Path path);

    /**
     * Returns a currently cached project for the provided scheme-aware URI without loading from disk.
     *
     * @param uri URI to resolve
     * @return cached project, if one is already registered for the URI scheme
     */
    @Nonnull
    Optional<Project> project(DocumentUri uri);

    /**
     * Loads or creates a project for the provided scheme-aware URI.
     *
     * @param uri URI to resolve
     * @param cancelChecker cancel checker
     * @return resolved project for the URI scheme
     */
    Project loadOrCreate(DocumentUri uri, CancelChecker cancelChecker);

    /**
     * Returns all known projects.
     *
     * @return projects collection
     */
    Collection<Project> allProjects();

    /**
     * Resolves the module for a path.
     *
     * @param path path to resolve
     * @param cancelChecker cancel checker
     * @return resolved module
     */
    Module module(Path path, CancelChecker cancelChecker);

    /**
     * Resolves the module for a scheme-aware URI.
     *
     * @param uri URI to resolve
     * @param cancelChecker cancel checker
     * @return resolved module for the URI scheme
     */
    Module module(DocumentUri uri, CancelChecker cancelChecker);

    /**
     * Resolves the document for a scheme-aware URI.
     *
     * @param uri URI to resolve
     * @param cancelChecker cancel checker
     * @return resolved document, if available
     */
    @Nonnull
    Optional<io.ballerina.projects.Document> document(DocumentUri uri, CancelChecker cancelChecker);

    /**
     * Returns the current locking mode.
     *
     * @param project project providing compilation options
     * @return current locking mode
     */
    LockingMode getLockingMode(Project project);

    /**
     * Batch-registers all Ballerina projects found under the given workspace folder paths (WM-C2).
     * Fires a single WM-E6 BatchProjectsRegistered event.
     *
     * @param workspaceFolders list of workspace root paths to scan; must not be null
     */
    void registerWorkspace(java.util.List<java.nio.file.Path> workspaceFolders);

    /**
     * Applies in-memory content to a document in the cached project so that the
     * synchronous {@code syntaxTree()} fallback returns the latest editor content.
     *
     * @param path absolute path of the changed file
     * @param content  the current content to apply
     */
    void applyDocumentContent(Path path, String content);

    /**
     * Removes a document from the cached project when its file is deleted.
     *
     * @param filePath absolute path of the deleted file
     */
    void removeDocumentFromProject(Path filePath);

    /**
     * Evicts the cached project for the given file path, forcing a fresh reload from
     * disk on the next {@code loadOrCreate} call.
     *
     * @param filePath a file path within the project to evict
     */
    void evictProject(Path filePath);

    /**
     * Signals that a document has been opened in the editor.
     *
     * <p>Creates an EDITOR-layer entry in the {@link ChangeBuffer} for the given URI,
     * updates direct open-document tracking, and applies buffered changes immediately.</p>
     *
     * @param uri     the document URI; must not be null
     * @param content the initial full-text content; must not be null
     */
    void didOpen(DocumentUri uri, String content);

    /**
     * Signals that the content of an open document has changed.
     *
     * <p>Appends each change to the EDITOR layer of the {@link ChangeBuffer} for the
     * given URI and applies buffered changes immediately.
     *
     * @param uri     the document URI; must not be null
     * @param changes ordered list of LSP content-change events; must not be null or empty
     */
    void didChange(DocumentUri uri, List<TextDocumentContentChangeEvent> changes);

    /**
     * Signals that a document has been closed in the editor.
     *
     * <p>Clears all EDITOR-layer buffered changes for the URI and updates direct open-document
     * tracking without routing through the event bus.</p>
     *
     * @param uri the document URI; must not be null
     */
    void didClose(DocumentUri uri);

    /**
     * Signals that one or more watched files have changed on the file system.
     *
     * <p>Routes each {@link FileEvent} to the {@link ChangeBuffer} and applies buffered
     * changes immediately.</p>
     *
     * @param events the list of file-watcher events; must not be null
     */
    void didChangeWatchedFiles(List<FileEvent> events);
}
