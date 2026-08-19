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

/**
 * Enumerates the three parallel overlay layers for document changes.
 * <p>
 * Maps to URI schemes per ADR-040:
 * <ul>
 *   <li>EDITOR - file:// URIs (user edits via editor)</li>
 *   <li>AI    - ai:// URIs (AI-generated edits)</li>
 *   <li>EXPR  - expr:// URIs (expression evaluation results)</li>
 * </ul>
 *
 * @since 1.7.0
 */
public enum ChangeLayer {
    EDITOR,
    AI,
    EXPR
}
