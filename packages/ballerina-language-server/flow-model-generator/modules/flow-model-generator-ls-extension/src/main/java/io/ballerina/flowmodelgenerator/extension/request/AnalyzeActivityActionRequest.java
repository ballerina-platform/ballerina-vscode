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

package io.ballerina.flowmodelgenerator.extension.request;

/**
 * A request to analyze a connector action's signature for the create-activity-from-action wizard.
 *
 * @param filePath   path of a file in the project the connection is defined in
 * @param connection name of the module-level connection variable the action belongs to
 * @param actionName name of the action (method) to analyze
 * @param nodeKind   the action node kind ({@code REMOTE_ACTION_CALL} or {@code RESOURCE_ACTION_CALL});
 *                   disambiguates connectors that have both a remote and a resource method with the
 *                   same name (e.g. {@code http:Client}'s {@code get})
 * @since 1.5.0
 */
public record AnalyzeActivityActionRequest(String filePath, String connection, String actionName, String nodeKind) {
}
