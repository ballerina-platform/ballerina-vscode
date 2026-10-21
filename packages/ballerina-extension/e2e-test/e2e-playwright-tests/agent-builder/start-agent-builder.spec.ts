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
import { test } from '@playwright/test';
import path from 'path';
import { AGENT_BUILDER_LABEL, getWebview, initTest, logStep, page } from '../utils/helpers';

// L4, journey 1 of docs/agent-builder-test-plan.md: the extension comes up in Agent Builder
// mode and lands the user on the agent entry point.
//
// The extension host reads WSO2_PRODUCT_MODE once at launch, and the Electron app inherits
// the Playwright worker's environment — so the variable must be set BEFORE VS Code starts
// (`pnpm run e2e-test:agent-builder`). Without it the group skips rather than failing
// against an Integrator window launched by another group.
const AGENT_BUILDER_MODE = 'agent-builder';

// A genuinely empty integration. The shared `empty_project` seeds an automation, which
// would take the overview past the "what should your agent do?" entry point.
const EMPTY_PROJECT_TEMPLATE = path.join(__dirname, '..', 'data', 'automation_creation_project');

export default function startAgentBuilderTests() {
    test.describe.serial('Start Agent Builder', {
    }, async () => {
        test.skip(
            process.env.WSO2_PRODUCT_MODE !== AGENT_BUILDER_MODE,
            `Needs WSO2_PRODUCT_MODE=${AGENT_BUILDER_MODE} at VS Code launch (pnpm run e2e-test:agent-builder)`
        );
        initTest(true, true, undefined, undefined, EMPTY_PROJECT_TEMPLATE);

        test('Open Agent Builder', async () => {
            logStep('Waiting for the Agent Builder webview');
            // The panel title is the mode's product name, so finding the frame by it is
            // itself the check that the host and the webview agree on the mode.
            const overview = await getWebview(AGENT_BUILDER_LABEL, page);
            if (!overview) {
                throw new Error(`${AGENT_BUILDER_LABEL} webview not found`);
            }

            logStep('Verifying the overview opens on the agent entry point');
            await overview.getByText('What should your agent do?').waitFor({ timeout: 60000 });
        });
    });
}
