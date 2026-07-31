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

package io.ballerina.centralconnector;

import io.ballerina.centralconnector.response.ConnectorResponse;
import io.ballerina.centralconnector.response.ConnectorsResponse;
import io.ballerina.centralconnector.response.DependentPackage;
import io.ballerina.centralconnector.response.FunctionResponse;
import io.ballerina.centralconnector.response.FunctionsResponse;
import io.ballerina.centralconnector.response.Listeners;
import io.ballerina.centralconnector.response.PackageResponse;
import io.ballerina.centralconnector.response.SymbolResponse;

import java.util.List;
import java.util.Map;

/**
 * A {@link CentralAPI} implementation that never contacts Ballerina Central. Every operation fails, forcing callers to
 * fall back to their local sources (the search index database, the build-owned package cache, or hardcoded defaults).
 * <p>
 * {@link RemoteCentral#getInstance()} returns this implementation when the {@code ls.test.offline} system property is
 * set, so tests resolve only from the build-provisioned Ballerina home and never over the network.
 *
 * @since 1.7.0
 */
public class OfflineCentral implements CentralAPI {

    private static final String MESSAGE = "Ballerina Central access is disabled (ls.test.offline)";

    @Override
    public PackageResponse searchPackages(Map<String, String> queryMap) {
        throw new UnsupportedOperationException(MESSAGE);
    }

    @Override
    public SymbolResponse searchSymbols(Map<String, String> queryMap) {
        throw new UnsupportedOperationException(MESSAGE);
    }

    @Override
    public FunctionsResponse functions(String organization, String name, String version) {
        throw new UnsupportedOperationException(MESSAGE);
    }

    @Override
    public Listeners listeners(String organization, String name, String version) {
        throw new UnsupportedOperationException(MESSAGE);
    }

    @Override
    public FunctionResponse function(String organization, String name, String version, String functionName) {
        throw new UnsupportedOperationException(MESSAGE);
    }

    @Override
    public ConnectorsResponse connectors(Map<String, String> queryMap) {
        throw new UnsupportedOperationException(MESSAGE);
    }

    @Override
    public ConnectorResponse connector(String id) {
        throw new UnsupportedOperationException(MESSAGE);
    }

    @Override
    public ConnectorResponse connector(String organization, String name, String version, String clientName) {
        throw new UnsupportedOperationException(MESSAGE);
    }

    @Override
    public String latestPackageVersion(String org, String name) {
        throw new UnsupportedOperationException(MESSAGE);
    }

    @Override
    public List<String> allPackageVersions(String org, String name) {
        throw new UnsupportedOperationException(MESSAGE);
    }

    @Override
    public Map<String, List<DependentPackage>> dependentPackages(String org, String packageName,
                                                                 List<String> versions) {
        throw new UnsupportedOperationException(MESSAGE);
    }

    @Override
    public Map<String, List<String>> packageKeywords(List<DependentPackage> modules) {
        throw new UnsupportedOperationException(MESSAGE);
    }

    @Override
    public boolean hasAuthorizedAccess() {
        return false;
    }
}
