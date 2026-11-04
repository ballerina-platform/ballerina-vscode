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

import javax.annotation.Nonnull;

/**
 * Provides URI-scoped workspace manager views for legacy proxy callers.
 *
 * @since 1.7.0
 */
public interface UriScopedWorkspaceManagerProvider {

    /**
     * Returns a workspace manager view that preserves the supplied document URI.
     *
     * @param uriString document URI; must not be null
     * @return URI-scoped workspace manager view; never null
     */
    @Nonnull
    WorkspaceManager forDocumentUri(@Nonnull String uriString);
}
