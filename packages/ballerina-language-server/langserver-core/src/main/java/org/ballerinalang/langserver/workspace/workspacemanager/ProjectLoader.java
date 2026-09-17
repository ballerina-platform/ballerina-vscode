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

import org.ballerinalang.langserver.workspace.workspacemanager.project.ProjectKind;
import org.ballerinalang.langserver.workspace.workspacemanager.uri.DocumentUri;

/**
 * Functional interface for loading Ballerina projects.
 *
 * <p>Decouples the workspace manager service from the Ballerina SDK,
 * enabling testability and dependency injection.</p>
 *
 * @since 1.7.0
 */
@FunctionalInterface
public interface ProjectLoader {

    /**
     * Loads a Ballerina project for the given source root and project kind.
     *
     * @param root the project source root URI; must not be null
     * @param kind the project kind; must not be null
     * @return a loaded Ballerina project; must not be null
     */
    io.ballerina.projects.Project load(DocumentUri root, ProjectKind kind);
}
