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

package org.ballerinalang.langserver.common.utils;

import io.ballerina.projects.util.ProjectUtils;
import org.ballerinalang.central.client.CentralAPIClient;
import org.wso2.ballerinalang.util.RepoUtils;

import java.util.Optional;

/**
 * Supplies Ballerina Central clients, or nothing when the language server runs without Central access.
 * <p>
 * Callers ask for a client and skip their Central path when none is returned; they never inspect how that decision was
 * made. This is the counterpart of {@code RemoteCentral.getInstance()} returning an offline implementation, and keeps
 * the "is Central reachable" question out of the services that use it.
 *
 * @since 1.7.0
 */
public final class CentralClientProvider {

    private CentralClientProvider() {
    }

    /**
     * A client for the Central REST API, or empty when Central is not reachable.
     *
     * @return An {@link Optional} holding the client.
     */
    public static Optional<CentralAPIClient> restClient() {
        if (!isCentralAvailable()) {
            return Optional.empty();
        }
        var settings = RepoUtils.readSettings();
        return Optional.of(new CentralAPIClient(RepoUtils.getRemoteRepoURL(),
                ProjectUtils.initializeProxy(settings.getProxy()), settings.getProxy().username(),
                settings.getProxy().password(), ProjectUtils.getAccessTokenOfCLI(settings),
                settings.getCentral().getConnectTimeout(), settings.getCentral().getReadTimeout(),
                settings.getCentral().getWriteTimeout(), settings.getCentral().getCallTimeout(),
                settings.getCentral().getMaxRetries()));
    }

    /**
     * A client for the Central GraphQL API, or empty when Central is not reachable.
     *
     * @return An {@link Optional} holding the client.
     */
    public static Optional<CentralAPIClient> graphQlClient() {
        if (!isCentralAvailable()) {
            return Optional.empty();
        }
        var settings = RepoUtils.readSettings();
        return Optional.of(new CentralAPIClient(RepoUtils.getRemoteRepoGraphQLURL(),
                ProjectUtils.initializeProxy(settings.getProxy()), ProjectUtils.getAccessTokenOfCLI(settings)));
    }

    /**
     * Whether the language server may reach Ballerina Central at all. False for test runs, which resolve only from the
     * build-provisioned Ballerina home.
     *
     * @return {@code true} when Central may be contacted.
     */
    public static boolean isCentralAvailable() {
        return !CommonUtil.TEST_OFFLINE;
    }
}
