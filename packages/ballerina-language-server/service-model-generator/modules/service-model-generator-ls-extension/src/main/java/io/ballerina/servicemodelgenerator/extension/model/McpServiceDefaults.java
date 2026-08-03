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
 *  KIND, either express or implied. See the License for the
 *  specific language governing permissions and limitations
 *  under the License.
 */

package io.ballerina.servicemodelgenerator.extension.model;

/**
 * CLI-equivalent defaults derived from an OpenAPI contract.
 *
 * @param serviceName the generated service name
 * @param version the service version
 * @param basePath the MCP base path
 * @param port the listener port
 * @param listenerName the generated listener variable name
 */
public record McpServiceDefaults(String serviceName, String version, String basePath, int port,
                                 String listenerName) {
}
