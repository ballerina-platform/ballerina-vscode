/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

/**
 * Which `chatStateStorage` key an execution's generation lives under.
 *
 * Lives in its own module so the rule can be tested without importing `AgentExecutor`, whose
 * graph reaches the AI SDK and the whole RPC layer.
 *
 * `chatStorage.projectRootPath` wins because that is the key `addGeneration` and
 * `getChatHistoryForLLM` use — see the fallback in `AICommandExecutor.run()`. A caller may scope
 * `executionContext` to a sub-package (the migration wizard passes the package path with
 * `workspacePath: undefined`); deriving the key from `executionContext` there addresses a
 * different store than the one holding the generation, so every write silently no-ops on a
 * missing generation ID. With `modelMessages` never stored, the next turn replays `uiResponse`
 * instead of the model history and the prompt grows past the token limit.
 */
export function resolveChatStoreKey(
    chatStorage: { projectRootPath?: string } | undefined,
    executionContext: { workspacePath?: string; projectPath?: string },
): string {
    return chatStorage?.projectRootPath
        || executionContext.workspacePath
        || executionContext.projectPath
        || '';
}
