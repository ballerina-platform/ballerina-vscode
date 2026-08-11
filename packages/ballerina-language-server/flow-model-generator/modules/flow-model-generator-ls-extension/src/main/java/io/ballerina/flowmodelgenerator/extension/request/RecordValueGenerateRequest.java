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

package io.ballerina.flowmodelgenerator.extension.request;

import com.google.gson.JsonElement;
import io.ballerina.flowmodelgenerator.core.model.Codedata;

/**
 * A request to generate the mapping constructor for a record type.
 *
 * @param filePath       path to the respective file
 * @param type           type of the record
 * @param typeConstraint the type the generated value is assigned to (e.g. a union such as
 *                       {@code jco:DestinationConfig|jco:AdvancedConfig}). When present, the generated value
 *                       is compile-probed against this type and an explicit type cast is added if the value
 *                       is ambiguous between union members. May be {@code null}/blank, in which case the bare
 *                       value is returned without any cast.
 * @param codedata       the codedata of the node the value belongs to. Supplies the {@code org}/{@code module}
 *                       used to import the target type's module for the compile probe (same source as the
 *                       {@code getSourceCode} flow). May be {@code null}.
 * @since 1.0.0
 */
public record RecordValueGenerateRequest(String filePath, JsonElement type, String typeConstraint,
                                         Codedata codedata) {
}
