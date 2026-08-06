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

package io.ballerina.modelgenerator.commons.trigger.models;

/**
 * A reference to a Ballerina type from within a {@link TriggerMetadataModel} document. A union
 * (e.g. a handler's {@code returns}) is modeled as {@code List<TypeRef>}; the first element is the
 * codegen default when nothing else disambiguates.
 *
 * @param name        the referenced type's name
 * @param packageInfo the originating module's coordinates; {@code null} for a same-module reference
 * @since 1.10.0
 */
public record TypeRef(String name, PackageInfo packageInfo) {

    /**
     * The coordinates of the module a cross-module {@link TypeRef} originates from.
     *
     * @param org         the organization name
     * @param packageName the package name
     * @param moduleName  the module name
     * @param version     the package version
     */
    public record PackageInfo(String org, String packageName, String moduleName, String version) {
    }
}
