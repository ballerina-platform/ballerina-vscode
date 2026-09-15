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

package io.ballerina.servicemodelgenerator.extension.model.response;

/**
 * One connector flagged by {@code ConnectorUpgradeAdvisor#analyze} as resolved to a version that predates
 * schema-driven trigger support, for the "your connectors need an update" prompt.
 *
 * @param orgName            the connector's organization
 * @param moduleName         the connector's module name
 * @param packageName        the connector's package name (equal to {@code moduleName} for a
 *                           single-module package, which every connector here is)
 * @param currentVersion     the version this project actually resolves
 * @param minSupportedVersion the lowest version known to ship schema-driven trigger resources
 * @param breaking           whether {@code currentVersion}'s (major, minor) differs from
 *                           {@code minSupportedVersion}'s -- crossing a boundary that may carry a
 *                           breaking API change, and so is never bundled into a one-click update
 * @param usedInFile         one file (relative to the package root) where the connector is used as
 *                           a service/listener, for the prompt's copy
 * @since 1.3.0
 */
public record ConnectorUpgradeAdvice(String orgName, String moduleName, String packageName,
                                     String currentVersion, String minSupportedVersion, boolean breaking,
                                     String usedInFile) {
}
