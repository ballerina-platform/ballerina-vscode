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
 * @param organization           restricts {@code getTriggerModels}'s bundled-index lookup to a single org
 * @param packageName            restricts {@code getTriggerModels}'s bundled-index lookup to a package
 * @param query                  the free-text search term for {@code searchTriggers}
 * @param keyWord                an additional bundled-index filter keyword
 * @param includeLocalRepository whether {@code searchTriggers} should also search the Ballerina local
 *                               repository ({@code ~/.ballerina/repositories/local}) for packages
 *                               shipping a trigger-metadata.json/trigger-ui-schema.json directly --
 *                               gated behind the client's own experimental setting, so this defaults to
 *                               {@code false} (Gson's zero-value default) for any client that predates
 *                               this field or has the setting off, with zero behavior change.
 */
public record TriggerListRequest(String organization, String packageName, String query, String keyWord,
                                 boolean includeLocalRepository) {
}
