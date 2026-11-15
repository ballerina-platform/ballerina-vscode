/*
 *  Copyright (c) 2024, WSO2 LLC. (http://www.wso2.com)
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

import io.ballerina.tools.text.LinePosition;

/**
 * Represents a request to paste copied statements into a flow.
 *
 * @param filePath  file path of the source file
 * @param text      the copied statements
 * @param target    where the statements go
 * @param sourceFilePath the file the statements were copied from, if known
 * @param formatted whether to return formatted edits
 * @since 1.7.0
 */
public record FlowNodesPasteRequest(String filePath, String text, LinePosition target, String sourceFilePath,
                                    boolean formatted) {
}
