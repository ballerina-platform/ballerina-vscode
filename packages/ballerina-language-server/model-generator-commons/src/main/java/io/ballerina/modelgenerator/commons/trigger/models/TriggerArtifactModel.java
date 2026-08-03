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

import io.ballerina.modelgenerator.commons.IconDescriptor;

import java.util.List;

/**
 * Deserialization target for a connector's {@code resources/trigger-artifact.json} — display-only
 * metadata for painting a project-tree entry, kept separate from the larger {@code trigger-ui-schema.json}.
 *
 * @param displayName the human-readable name for the project-tree entry
 * @param icon        the icon to render for the project-tree entry
 * @param labelFields service-annotation field names to try, in order, for the instance-label suffix;
 *                    {@code null}/empty means no suffix
 * @since 1.9.0
 */
public record TriggerArtifactModel(String displayName, IconDescriptor icon, List<String> labelFields) {
}
