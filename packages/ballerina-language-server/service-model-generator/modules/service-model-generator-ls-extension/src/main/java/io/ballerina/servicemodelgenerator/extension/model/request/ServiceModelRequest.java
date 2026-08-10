/*
 *  Copyright (c) 2025, WSO2 LLC. (http://www.wso2.com)
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

package io.ballerina.servicemodelgenerator.extension.model.request;

/**
 * @param filePath          the path of the file the service is being added to
 * @param orgName           the organization name of the connector's package
 * @param pkgName           the name of the connector's package
 * @param moduleName        the name of the connector's module
 * @param listenerName      the identifier of an existing listener to attach to, if any
 * @param version           the version of the connector's package
 * @param isLocalRepository whether the connector was picked from a search result found in the Ballerina
 *                          local repository ({@code ~/.ballerina/repositories/local}) rather than
 *                          Central -- the client is the one that knows which result list a selection
 *                          came from, so this must be supplied explicitly rather than inferred (a
 *                          brand-new local connector has no {@code Ballerina.toml} entry yet to infer it
 *                          from). Defaults to {@code false} for every existing/older client.
 */
public record ServiceModelRequest(String filePath, String orgName, String pkgName, String moduleName,
                                  String listenerName, String version, boolean isLocalRepository) {

    public ServiceModelRequest(String filePath, String orgName, String pkgName, String moduleName,
                               String listenerName, String version) {
        this(filePath, orgName, pkgName, moduleName, listenerName, version, false);
    }

    public ServiceModelRequest(String filePath, String orgName, String moduleName, String listenerName) {
        this(filePath, orgName, moduleName, moduleName, listenerName, null, false);
    }

    public ServiceModelRequest(String filePath, String orgName, String pkgName, String moduleName,
                               String listenerName) {
        this(filePath, orgName, pkgName, moduleName, listenerName, null, false);
    }
}
