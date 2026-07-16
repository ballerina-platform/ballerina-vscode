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

import io.ballerina.tools.text.LineRange;

/**
 * Request to read class-owned flow nodes initialized inside a class constructor.
 *
 * @param filePath       absolute source file path
 * @param classLineRange range of the containing class
 * @since 1.0.0
 */
public record ClassOwnedNodeRequest(String filePath, LineRange classLineRange) {
}
