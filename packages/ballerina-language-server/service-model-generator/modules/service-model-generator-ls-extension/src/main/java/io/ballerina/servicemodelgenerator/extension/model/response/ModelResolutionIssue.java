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
 * A structured reason for why a model-resolution request produced no model, distinct from a genuine
 * {@code Throwable}-backed error. Lets the client distinguish "this connector's resolved version predates
 * schema-driven support" from "there is legitimately nothing to show" -- both of which previously
 * surfaced as an identical all-null response.
 *
 * @param code            one of {@link #UNSUPPORTED_CONNECTOR_VERSION} / {@link #NO_SUPPORTED_VERSION_AVAILABLE}
 * @param orgName         the connector's organization
 * @param moduleName      the connector's module name
 * @param currentVersion  the version the project actually resolves, if known
 * @param requiredVersion the minimum version known to carry schema-driven trigger resources, if any
 * @since 1.3.0
 */
public record ModelResolutionIssue(String code, String orgName, String moduleName, String currentVersion,
                                    String requiredVersion) {

    /** The resolved version predates schema-driven trigger support; a newer version is known and pullable. */
    public static final String UNSUPPORTED_CONNECTOR_VERSION = "UNSUPPORTED_CONNECTOR_VERSION";

    /** No version of this connector has been onboarded onto schema-driven trigger support yet. */
    public static final String NO_SUPPORTED_VERSION_AVAILABLE = "NO_SUPPORTED_VERSION_AVAILABLE";
}
