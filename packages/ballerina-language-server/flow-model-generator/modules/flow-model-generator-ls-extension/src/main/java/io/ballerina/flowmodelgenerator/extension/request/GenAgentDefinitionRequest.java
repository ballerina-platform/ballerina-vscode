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

/**
 * A request to generate an empty custom agent class definition (a class including {@code *ai:FixedReturnAgentType})
 * from a name + description.
 *
 * @param filePath    a file in the target project (used to resolve the project root; the class is written to
 *                    {@code <name>.bal})
 * @param name        the agent class name
 * @param description the class doc-comment description
 * @since 1.0.0
 */
public record GenAgentDefinitionRequest(String filePath, String name, String description) {
}
