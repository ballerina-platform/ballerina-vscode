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

package io.ballerina.servicemodelgenerator.extension.model;

import java.util.List;

/**
 * A trigger picker entry, loaded once (as a flat map) from {@code trigger_properties.json}.
 *
 * <p>{@code version}/{@code kind} are optional, populated only for a schema-driven trigger
 * (transcribed from its {@code trigger-model.json}'s own top-level fields at onboarding time). When
 * present, {@link ServiceModelGeneratorService} builds the trigger's {@link TriggerBasicInfo} directly
 * from these scalars (deriving the icon URL from {@code orgName}/{@code packageName}/{@code version}),
 * without parsing/caching the connector's full {@code TriggerUISchemaModel} just to populate the picker
 * list. A legacy trigger (e.g. HTTP, which has no schema-driven model at all) simply omits them,
 * falling back to the sqlite index derived from {@code service_artifacts.json}.
 *
 * @param name        the trigger's display name
 * @param orgName     the organization that owns the trigger's package
 * @param packageName the name of the package that provides the trigger
 * @param keywords    keywords used to search for the trigger in the picker
 * @param triggerName the trigger's unique identifier
 * @param version     the schema-driven trigger's model version, if any
 * @param kind        the schema-driven trigger's kind, if any
 */
public record TriggerProperty(String name, String orgName, String packageName, List<String> keywords,
                              String triggerName, String version, String kind) {
}
