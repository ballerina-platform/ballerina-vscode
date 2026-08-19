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

package org.ballerinalang.langserver.workspace.workspacemanager.project;

/**
 * Classifies a project as active (has open documents) or background (no open documents).
 * Active projects are exempt from LRU eviction (ADR-013).
 * Declared as a top-level enum so T-009 event payloads can reference it
 * without coupling to {@link OpenDocumentCount}.
 *
 * @since 1.7.0
 */
public enum ProjectTier {
    /** At least one document is open in the editor for this project. */
    ACTIVE,
    /** No documents are currently open for this project. */
    BACKGROUND
}
