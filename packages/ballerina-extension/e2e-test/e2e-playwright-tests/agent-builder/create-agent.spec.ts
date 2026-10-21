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
import { expect, test } from '@playwright/test';
import { initTest, logStep } from '../utils/helpers';
import {
    AGENT_BUILDER_MODE,
    EMPTY_PROJECT_TEMPLATE,
    chooseGalleryCard,
    fillField,
    openAddAgentGallery,
    reloadWindow,
    settledSource,
    submitForm,
} from './agentForm';

// L4, journey 2 of docs/agent-builder-test-plan.md: create an agent from the Agent Builder
// overview and prove it reached source.
//
// Scoped to what this repository owns. The Ballerina extension owns the visualizer — the
// overview, the agent form and the source they generate — while the welcome screen, project
// creation and the explorer belong to the Product Integrator extension. So this journey opens
// a seeded project and starts at the overview; project creation is covered on that side.
//
// Source is asserted by content rather than against a fixture file, because what matters is
// that the agent carries the role and instructions that were typed and is bound to a model.
// Comparing whole files would make this fail on formatting.
const AGENT_NAME = 'greeterAgent';
const AGENT_ROLE = 'Greeter';
const AGENT_INSTRUCTIONS = 'Greet the user warmly and keep replies to one sentence.';

// The marker every wait here uses, and what the next test asserts. The name reaches source
// before the declaration around it is finished, so waiting on the name alone can hand the
// next test a settled-looking file that is still a write behind.
const DECLARED = new RegExp(`final\\s+ai:Agent\\s+${AGENT_NAME}\\s*=\\s*check\\s+new`);

export default function createAgentTests() {
    test.describe.serial('Create an agent', {
    }, async () => {
        test.skip(
            process.env.WSO2_PRODUCT_MODE !== AGENT_BUILDER_MODE,
            `Needs WSO2_PRODUCT_MODE=${AGENT_BUILDER_MODE} at VS Code launch (pnpm run e2e-test:agent-builder)`
        );
        initTest(true, true, undefined, undefined, EMPTY_PROJECT_TEMPLATE);

        test('Create an agent from the overview', async () => {
            logStep('Opening the add-agent gallery from the overview');
            const gallery = await openAddAgentGallery();

            logStep('Choosing a one-off agent from the gallery');
            // "Create Agent" under "Create New" is the blank one-off; the durable and
            // definition cards beside it lead to different journeys.
            const form = await chooseGalleryCard(gallery, 'Create Agent');

            logStep('Filling the agent form');
            await fillField(form, 'Agent Name', AGENT_NAME);
            await fillField(form, 'Role', AGENT_ROLE);
            await fillField(form, 'Instructions', AGENT_INSTRUCTIONS);

            logStep('Creating the agent');
            await submitForm(form, /Create Agent/i);

            logStep('Waiting for the agent to reach source');
            await settledSource(DECLARED);
        });

        test('Writes the typed configuration and binds a model', async () => {
            const source = await settledSource(DECLARED);

            logStep('Checking the agent is declared against ballerina/ai');
            expect(source).toContain('import ballerina/ai;');
            expect(source).toMatch(DECLARED);

            logStep('Checking the declaration carries what was typed');
            expect(source).toContain(AGENT_ROLE);
            expect(source).toContain(AGENT_INSTRUCTIONS);
            // The role and the instructions belong to the system prompt. Without this an
            // agent that carried the same text as some unrelated argument would still pass.
            expect(source).toMatch(/systemPrompt\s*=\s*\{[^}]*\brole\b\s*:/);
            expect(source).toMatch(/systemPrompt\s*=\s*\{[^}]*\binstructions\b\s*:/);

            logStep('Checking the agent is bound to a model provider');
            // The form leaves the provider at its default, which the generator inlines into
            // the agent as a call rather than declaring a separate provider variable.
            expect(source).toMatch(/\bmodel\s*=\s*(check\s+)?ai:\w+/);
        });

        test('Keeps the agent after a reload', async () => {
            logStep('Reloading the window');
            const overview = await reloadWindow();

            logStep('Checking the overview still shows the agent');
            await overview.getByText(AGENT_NAME, { exact: false }).first().waitFor({ timeout: 120000 });

            // The source is the real record; a stale webview could show a name it cached.
            // Settled rather than read once: the reload re-opens the project and the generator
            // rewrites the files behind it, so a bare read here can catch one mid-write.
            expect(await settledSource(DECLARED)).toMatch(DECLARED);
        });
    });
}
