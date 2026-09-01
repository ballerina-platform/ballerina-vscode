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

import java.util.List;

/**
 * One section of a handler form's authored layout, carried from a schema-driven trigger's
 * {@code TriggerUISchemaModel.LayoutSection} to the designer. Presentation only -- the generated function
 * signature always follows {@link Function#getParameters()} order.
 *
 * @param id          an identifier for this section
 * @param label       the heading rendered above this section; absent -> no heading
 * @param description explanatory text rendered under {@code label}
 * @param advanced    {@code true} renders this section inside the collapsed advanced box
 * @param fields      the ids of the units in this section, in render order
 * @since 1.9.0
 */
public record LayoutSection(String id, String label, String description, Boolean advanced,
                            List<String> fields) {
}
