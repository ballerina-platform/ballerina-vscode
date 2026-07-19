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
 * A request to generate an {@code @ai:AgentTool} wrapper that delegates to another agent's {@code run} method.
 *
 * @param filePath       path of the file to generate the tool in
 * @param agentVarName   variable name of the agent to delegate to
 * @param includeContext whether to pass the agent context to the run method
 * @param toolName       name of the generated tool
 * @param description    description of the generated tool
 * @since 1.0.0
 */
public record GenAgentToolRequest(String filePath, String agentVarName, boolean includeContext, String toolName,
                                  String description) {
}
