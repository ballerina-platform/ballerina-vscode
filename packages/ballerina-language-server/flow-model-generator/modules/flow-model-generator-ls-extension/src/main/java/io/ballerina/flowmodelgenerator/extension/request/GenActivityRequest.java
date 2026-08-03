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

package io.ballerina.flowmodelgenerator.extension.request;

import com.google.gson.JsonElement;

/**
 * A request to generate a workflow activity function wrapping a connection action call.
 *
 * @param filePath           path of the file to add the activity function to
 * @param flowNode           the action call diagram node
 * @param activityName       name of the activity function
 * @param activityParameters activity function parameters property node
 * @param description        description of the activity
 * @param connection         name of the connection the action was selected from
 * @param streamElementType  when the action returns a stream, its element type {@code T}: the
 *                           generated activity collects the stream and returns {@code T[]}; else null
 * @param connectionAsParam  when {@code true}, the connection is exposed as the activity's first
 *                           parameter (built-in activity style) instead of closing over the
 *                           module-level connection
 * @since 1.5.0
 */
public record GenActivityRequest(String filePath, JsonElement flowNode, String activityName,
                                 JsonElement activityParameters, String description, String connection,
                                 String streamElementType, boolean connectionAsParam) {
}
