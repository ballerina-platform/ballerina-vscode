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

package org.ballerinalang.langserver.commons.workspace;

/**
 * A {@link WorkspaceManagerProxy} implementation that delegates all calls to a single unified workspace manager.
 *
 * <p>Multi-scheme URI routing (e.g. {@code expr://}, {@code ai://}) is handled internally
 * by the workspace manager facade. {@link #get(String)} returns a URI-scoped view when the
 * wrapped manager supports {@link UriScopedWorkspaceManagerProvider}.
 *
 * <p>This class exists to satisfy the legacy {@link WorkspaceManagerProxy} contract expected by
 * {@code ExtendedLanguageServerService} implementations, bridging the old proxy-based API with the
 * unified workspace manager facade introduced in 1.7.0.
 *
 * @since 1.7.0
 */
public final class UnifiedWorkspaceManagerProxy implements WorkspaceManagerProxy {

    private final WorkspaceManager workspaceManager;

    /**
     * Creates a proxy that wraps the given workspace manager.
     *
     * @param workspaceManager the unified workspace manager facade; must not be null
     */
    public UnifiedWorkspaceManagerProxy(WorkspaceManager workspaceManager) {
        this.workspaceManager = workspaceManager;
    }

    /**
     * Returns the unified workspace manager.
     *
     * @return the workspace manager
     */
    @Override
    public WorkspaceManager get() {
        return workspaceManager;
    }

    /**
     * Returns a URI-scoped view of the unified workspace manager when available.
     *
     * @param fileUri file URI
     * @return the workspace manager
     */
    @Override
    public WorkspaceManager get(String fileUri) {
        if (workspaceManager instanceof UriScopedWorkspaceManagerProvider provider
                && fileUri != null && !fileUri.isBlank() && isSupportedUri(fileUri)) {
            return provider.forDocumentUri(fileUri);
        }
        return workspaceManager;
    }

    private boolean isSupportedUri(String value) {
        String scheme = schemeOf(value);
        return "file".equals(scheme) || "bala".equals(scheme) || "expr".equals(scheme) || "ai".equals(scheme);
    }

    private String schemeOf(String value) {
        int colonIndex = value.indexOf(':');
        if (colonIndex <= 0) {
            return "";
        }
        for (int i = 0; i < colonIndex; i++) {
            char c = value.charAt(i);
            if (!Character.isLetterOrDigit(c) && c != '+' && c != '-' && c != '.') {
                return "";
            }
        }
        return value.substring(0, colonIndex);
    }
}
