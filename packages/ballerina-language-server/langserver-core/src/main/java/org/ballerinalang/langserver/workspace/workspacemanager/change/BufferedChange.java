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

import org.eclipse.lsp4j.TextDocumentContentChangeEvent;

import javax.annotation.Nonnull;

/**
 * Immutable wrapper for a text document change event with layer and version metadata.
 * <p>
 * This record is a simple data carrier used by the overlay-based change buffer (ADR-047).
 * It wraps the LSP {@link TextDocumentContentChangeEvent} with the source
 * {@link ChangeLayer} and the associated {@link ContentVersion}.
 *
 * @param change the LSP text document content change
 * @param layer the source layer for the change
 * @param version content version associated with the change
 * @since 1.7.0
 */
public record BufferedChange(
        @Nonnull TextDocumentContentChangeEvent change,
        @Nonnull ChangeLayer layer,
        @Nonnull ContentVersion version
) {
    /**
     * Creates a new buffered change.
     *
     * @param change  the LSP change event
     * @param layer   the source layer (EDITOR, AI, or EXPR)
     * @param version the content version
     */
    public BufferedChange {
    }
}
