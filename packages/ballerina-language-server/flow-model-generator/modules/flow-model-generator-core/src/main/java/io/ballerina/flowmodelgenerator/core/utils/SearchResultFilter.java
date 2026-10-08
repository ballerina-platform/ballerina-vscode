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

package io.ballerina.flowmodelgenerator.core.utils;

import com.google.gson.reflect.TypeToken;
import io.ballerina.flowmodelgenerator.core.LocalIndexCentral;
import io.ballerina.projects.Project;

import java.lang.reflect.Type;
import java.util.HashSet;
import java.util.Set;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * The filters shared by the library and connector searches, so that every search surfaces the same packages whether
 * its results come from Ballerina Central or from the local index.
 *
 * @since 1.7.0
 */
public final class SearchResultFilter {

    private static final Logger LOGGER = Logger.getLogger(SearchResultFilter.class.getName());
    private static final Set<String> ALLOWED_ORGANIZATIONS = Set.of("ballerina", "ballerinax", "wso2");
    private static final Set<String> BLACKLISTED_CONNECTOR_NAME_PATTERNS = Set.of("ModelProvider");

    // A bal tool package carries a CLI command rather than an importable API. The index generators skip them, but
    // Central does not mark them in its search responses, so the generator also records them in this resource.
    public static final String TOOL_PACKAGES_JSON = "tool_packages.json";
    private static final Type TOOL_PACKAGES_TYPE = new TypeToken<Set<String>>() { }.getType();
    private static final Set<String> TOOL_PACKAGES = loadToolPackages();

    private SearchResultFilter() {
    }

    /**
     * The organizations whose packages are surfaced: the Ballerina and WSO2 organizations, and the organization of
     * the current package.
     *
     * @param project the current project
     * @return the allowed organization names
     */
    public static Set<String> allowedOrganizations(Project project) {
        Set<String> allowedOrgs = new HashSet<>(ALLOWED_ORGANIZATIONS);
        String currentOrg = project.currentPackage().packageOrg().value();
        if (currentOrg != null && !currentOrg.isEmpty()) {
            allowedOrgs.add(currentOrg);
        }
        return allowedOrgs;
    }

    /**
     * The organizations whose packages are surfaced, without the current package's organization.
     *
     * @return the allowed organization names
     */
    public static Set<String> allowedOrganizations() {
        return ALLOWED_ORGANIZATIONS;
    }

    /**
     * The name patterns of connectors that are not surfaced by the connector searches.
     *
     * @return the blacklisted connector name patterns
     */
    public static Set<String> blacklistedConnectorNamePatterns() {
        return BLACKLISTED_CONNECTOR_NAME_PATTERNS;
    }

    /**
     * Checks whether a connector name matches a blacklisted pattern.
     *
     * @param connectorName the connector name
     * @return true if the connector is not to be surfaced
     */
    public static boolean isBlacklistedConnector(String connectorName) {
        return isBlacklistedConnector(connectorName, BLACKLISTED_CONNECTOR_NAME_PATTERNS);
    }

    /**
     * Checks whether a connector name matches any of the given name patterns.
     *
     * @param connectorName the connector name
     * @param patterns      the name patterns to match against
     * @return true if the connector is not to be surfaced
     */
    public static boolean isBlacklistedConnector(String connectorName, Set<String> patterns) {
        return connectorName != null && patterns.stream().anyMatch(connectorName::contains);
    }

    /**
     * Checks whether a package is a bal tool package.
     *
     * @param org         the organization name
     * @param packageName the package name
     * @return true if the package is a bal tool package
     */
    public static boolean isToolPackage(String org, String packageName) {
        return org != null && packageName != null && TOOL_PACKAGES.contains(org + "/" + packageName);
    }

    private static Set<String> loadToolPackages() {
        try {
            Set<String> toolPackages =
                    LocalIndexCentral.getInstance().readJsonResource(TOOL_PACKAGES_JSON, TOOL_PACKAGES_TYPE);
            return toolPackages != null ? Set.copyOf(toolPackages) : Set.of();
        } catch (RuntimeException e) {
            // Without the list, tool packages are only kept out of the local index results.
            LOGGER.log(Level.WARNING, "Failed to load " + TOOL_PACKAGES_JSON + "; tool packages are not filtered "
                    + "from Ballerina Central results", e);
            return Set.of();
        }
    }
}
