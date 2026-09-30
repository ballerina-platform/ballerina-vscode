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

package io.ballerina.servicemodelgenerator.extension.model;

/**
 * The version a connector the project does not depend on yet is modelled against, and where it came from.
 *
 * @param version the selected connector version
 * @param source  the source the version was selected from
 * @since 1.10.0
 */
public record ResolvedConnectorVersion(String version, VersionSource source) {

    /**
     * Where a connector version was selected from, in descending order of preference.
     */
    public enum VersionSource {
        CENTRAL_LATEST,
        LOCAL_CACHE_LATEST,
        MIN_SUPPORTED
    }
}
