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
 * Theme-aware artifact icon returned to IDE clients.
 *
 * @param url fallback Ballerina Central icon URL
 * @param light raw light-theme SVG text
 * @param dark raw dark-theme SVG text
 * @param color optional tint for SVGs using {@code currentColor}
 * @param kind semantic artifact kind used by generic fallbacks
 * @param source source of the descriptor, such as {@code trigger-ui-metadata}
 */
public record ArtifactIcon(String url, String light, String dark, String color, String kind, String source) {

    public static ArtifactIcon from(String fallbackUrl, String kind, ArtifactInfo.Resolved artifactInfo) {
        if (artifactInfo == null || artifactInfo.icon() == null) {
            return new ArtifactIcon(fallbackUrl, null, null, null, kind, "ballerina-central");
        }
        ArtifactInfo.ResolvedIcon icon = artifactInfo.icon();
        return new ArtifactIcon(fallbackUrl, icon.light(), icon.dark(), icon.color(), kind,
                "trigger-ui-metadata");
    }
}
