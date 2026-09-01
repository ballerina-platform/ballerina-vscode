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

import java.util.List;
import java.util.Map;

/**
 * Small, artifact-tree-specific projection of a trigger's L2 UI metadata.
 *
 * <p>The authored {@link Icon} contains paths relative to {@code trigger-ui-metadata.json}. The
 * {@link Resolved} form contains the SVG text read from those paths so clients do not need access to
 * the language-server jar or the connector bala.</p>
 *
 * @param displayLabel         base label shown for a service artifact
 * @param displayLabelOverrides labels keyed by the semantic service type's unqualified name
 * @param icon                 theme-specific icon resources
 * @param identifier           ordered rules used to derive the artifact-specific label suffix
 * @since 1.10.0
 */
public record ArtifactInfo(
        String displayLabel,
        Map<String, String> displayLabelOverrides,
        Icon icon,
        Identifier identifier) {

    public record Icon(String lightPath, String darkPath, String color) {
    }

    public record Identifier(String separator, List<Resolver> resolvers) {

        public String effectiveSeparator() {
            return separator == null ? " - " : separator;
        }
    }

    /**
     * @param via    {@code annotationField}, {@code servicePath}, or {@code sourceIdentifier}
     * @param fields ordered annotation field names used by {@code annotationField}
     */
    public record Resolver(String via, List<String> fields) {
    }

    public record Resolved(
            String displayLabel,
            Map<String, String> displayLabelOverrides,
            ResolvedIcon icon,
            Identifier identifier) {

        public String labelForServiceType(String serviceType) {
            if (serviceType == null || displayLabelOverrides == null) {
                return displayLabel;
            }
            String unqualified = serviceType.contains(":")
                    ? serviceType.substring(serviceType.lastIndexOf(':') + 1)
                    : serviceType;
            return displayLabelOverrides.getOrDefault(unqualified, displayLabel);
        }
    }

    /** Raw, trusted SVG text returned on the LS wire, plus the optional brand tint. */
    /**
     * @param light raw SVG text for light themes
     * @param dark raw SVG text for dark themes
     * @param color optional replacement color for {@code currentColor}
     */
    public record ResolvedIcon(String light, String dark, String color) {
    }
}
