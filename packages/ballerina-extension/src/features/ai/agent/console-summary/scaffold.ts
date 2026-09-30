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
 * Whether this request is the console plan's scaffold turn.
 *
 * Decided by the explicit `consoleScaffold` flag that stateMachine.ts sets on the one
 * prompt it auto-submits, never by the prompt's text or hidden context: those are
 * shaped for the model and change as the scaffold prompt evolves. The session must
 * also have been opened with a plan, so a stray flag outside one does nothing.
 */
export function isConsoleScaffoldTurn(
    consoleScaffold: boolean | undefined,
    env: NodeJS.ProcessEnv = process.env
): boolean {
    return consoleScaffold === true && !!env.INITIAL_SCAFFOLD_PROMPT && !!env.INITIAL_SCAFFOLD_STEPS;
}
