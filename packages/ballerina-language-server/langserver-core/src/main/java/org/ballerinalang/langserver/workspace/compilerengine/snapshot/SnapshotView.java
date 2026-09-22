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

import io.ballerina.compiler.syntax.tree.SyntaxTree;
import io.ballerina.projects.DocumentId;
import org.ballerinalang.langserver.workspace.workspacemanager.change.ContentVersion;

/**
 * Shared syntax-level snapshot contract for the dual-snapshot access pattern.
 *
 * @since 1.7.0
 */
public interface SnapshotView {

    /**
     * Returns the syntax tree for the given document.
     *
     * @param docId the document identifier
     * @return the syntax tree for the given document
     */
    SyntaxTree syntaxTree(DocumentId docId);

    /**
     * Returns the content version represented by this snapshot.
     *
     * @return the snapshot content version
     */
    ContentVersion contentVersion();
}
