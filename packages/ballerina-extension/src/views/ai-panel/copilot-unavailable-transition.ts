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

import { assign } from 'xstate';
import { CopilotTokenExchangeUnavailableError } from '../../utils/ai/auth';

/**
 * Where checking the Copilot token goes when the WSO2 Cloud region in use has no Copilot backend: to the sign-in
 * view, so another sign-in can be chosen. The WSO2 Cloud session stays; `clearCopilotCredentials` drops only the
 * Copilot token kept for the other region and gives the reason as a notification, since the login panel shows no
 * error and a key form reached from it would show it as if the key were rejected.
 */
export function copilotUnavailableTransition() {
    return {
        cond: (_ctx: unknown, event: { data?: unknown }) => event.data instanceof CopilotTokenExchangeUnavailableError,
        target: 'Unauthenticated',
        actions: [
            'clearCopilotCredentials',
            assign({
                loginMethod: (_ctx) => undefined,
                userToken: (_ctx) => undefined,
                errorMessage: (_ctx) => undefined,
            }),
        ],
    };
}
