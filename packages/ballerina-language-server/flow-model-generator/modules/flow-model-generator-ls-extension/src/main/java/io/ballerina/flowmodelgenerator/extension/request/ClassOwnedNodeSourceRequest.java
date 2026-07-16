/*
 *  Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com)
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *  http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

package io.ballerina.flowmodelgenerator.extension.request;

import com.google.gson.JsonElement;
import io.ballerina.tools.text.LineRange;

/**
 * Request to create or update a flow node owned by a class field.
 *
 * @param filePath       absolute source file path
 * @param flowNode       configured flow node
 * @param classLineRange range of the containing class
 * @param wiring         optional class-local wiring instructions
 * @since 1.0.0
 */
public record ClassOwnedNodeSourceRequest(String filePath, JsonElement flowNode, LineRange classLineRange,
                                          ClassOwnedNodeWiring wiring) {

    public record ClassOwnedNodeWiring(String kind) {
    }
}
