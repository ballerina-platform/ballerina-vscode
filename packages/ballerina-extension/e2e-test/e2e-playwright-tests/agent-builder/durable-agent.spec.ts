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
import type { Frame, Locator } from '@playwright/test';
import { AGENT_BUILDER_LABEL, getWebview, initTest, logStep, page } from '../utils/helpers';
import {
    AGENT_BUILDER_MODE,
    EMPTY_PROJECT_TEMPLATE,
    chooseGalleryCard,
    field,
    fillField,
    openAddAgentGallery,
    reloadWindow,
    settledSource,
    submitForm,
} from './agentForm';

// L4, journey 3 of docs/agent-builder-test-plan.md: create a durable agent from the Agent
// Builder overview, give it a capability, and prove both reach source and survive a reopen.
//
// Scope. A durable agent's reviewer, run trigger and data channel are already driven
// end-to-end by the workflow-docs journey (`workflow-docs/quickstarts/build-durable-agent`)
// and the group-4 durable suites. Those steps are the same code in either product mode, so
// repeating them here would buy duplication rather than coverage. What is only reachable in
// Agent Builder mode is the entry point — the durable card in the overview's add-agent
// gallery — and that the agent diagram it lands on works on a freshly created agent, so that
// is what this journey covers.
//
// A durable agent is not an `ai:Agent` value like journey 2's: it is a `workflow:DurableAgent`
// and its model provider is a separate declaration rather than an inlined call, so the source
// assertions differ from journey 2's on purpose.
const AGENT_NAME = 'claimAgent';
const AGENT_ROLE = 'Claims Officer';
const AGENT_INSTRUCTIONS = 'Review the claim and decide whether it needs a human reviewer.';
const ACTIVITY_NAME = 'validateClaim';

// Registering a capability is two writes: the activity's function first, then its entry in
// the agent's `activities`. An activity that needs no binding is registered as a bare
// reference; one that takes a connection gets a record instead. Both the wait and the
// assertion use this so a slow second write cannot be mistaken for a finished one.
const REGISTERED_ON_AGENT = new RegExp(`activities\\s*:\\s*\\[[^\\]]*\\b${ACTIVITY_NAME}\\b`);

// Likewise for the agent itself: the name reaches source before the declaration around it
// is finished, so every wait uses the declaration the next test asserts.
const DECLARED = new RegExp(`final\\s+workflow:DurableAgent\\s+${AGENT_NAME}\\s*=\\s*check\\s+new`);

/** A list row can still be sliding in when it resolves; settle it before clicking. */
async function clickListItem(sidePanel: Locator, name: string): Promise<void> {
    const item = sidePanel.getByText(name, { exact: true }).first();
    await item.waitFor({ state: 'visible', timeout: 60000 });
    await item.scrollIntoViewIfNeeded();
    await page.page.waitForTimeout(500);
    await item.click({ force: true });
}

/** Panel controls can be reported outside the viewport while the panel settles. */
async function clickPanelControl(control: Locator): Promise<void> {
    await control.waitFor({ state: 'visible', timeout: 60000 });
    await control.scrollIntoViewIfNeeded();
    await page.page.waitForTimeout(500);
    await control.click({ force: true, timeout: 5000 }).catch(() => control.dispatchEvent('click'));
}

/**
 * A capability save keeps the panel open behind an "Applying changes..." loader until the
 * refreshed canvas lands, then refreshes again on a timer. Waiting for Save to hide is not
 * enough — the next action would race that refresh.
 */
async function waitForPanelToClose(webview: Frame): Promise<void> {
    await webview.getByTestId('side-panel').waitFor({ state: 'detached', timeout: 90000 });
    await page.page.waitForTimeout(5000);
}

/** Makes sure the durable agent's own diagram is showing. */
async function openDurableAgent(webview: Frame): Promise<void> {
    const agentBox = webview.getByTestId('durable-agent-run-node');
    if (await agentBox.isVisible()) {
        return;
    }
    const entry = webview.getByText(AGENT_NAME, { exact: true }).first();
    await entry.waitFor({ timeout: 120000 });
    await entry.click({ force: true });
    await agentBox.waitFor({ state: 'visible', timeout: 60000 });
}

export default function durableAgentTests() {
    test.describe.serial('Create a durable agent', {
    }, async () => {
        test.skip(
            process.env.WSO2_PRODUCT_MODE !== AGENT_BUILDER_MODE,
            `Needs WSO2_PRODUCT_MODE=${AGENT_BUILDER_MODE} at VS Code launch (pnpm run e2e-test:agent-builder)`
        );
        initTest(true, true, undefined, undefined, EMPTY_PROJECT_TEMPLATE);

        test('Create a durable agent from the overview', async () => {
            logStep('Opening the add-agent gallery from the overview');
            const gallery = await openAddAgentGallery();

            logStep('Choosing a durable agent from the gallery');
            const form = await chooseGalleryCard(gallery, 'Create Durable Agent');

            logStep('Waiting for the durable agent form');
            // Opening this form pulls the workflow package the first time a project uses one,
            // and a loader stands in for the form until that finishes — minutes, not seconds.
            await field(form, 'Name').waitFor({ state: 'visible', timeout: 420000 });

            logStep('Filling the durable agent form');
            // This form names the field "Name", not "Agent Name" as the ai:Agent form does;
            // it is the workflow function form that the durable branch reuses. Model and
            // Input Data Type are left alone: the default provider is what an automated run
            // can rely on, and the input type is optional.
            await fillField(form, 'Name', AGENT_NAME);
            await fillField(form, 'Role', AGENT_ROLE);
            await fillField(form, 'Instructions', AGENT_INSTRUCTIONS);

            logStep('Creating the durable agent');
            await submitForm(form, /Create Agent/i);

            logStep('Waiting for the durable agent to reach source');
            // The first durable agent in a project pulls the workflow package before anything
            // is written, so this is slower than an ordinary agent by minutes, not seconds.
            await settledSource(DECLARED, 420000);
        });

        test('Writes a durable agent carrying what was typed', async () => {
            const source = await settledSource(DECLARED);

            logStep('Checking the agent is declared as a durable workflow agent');
            expect(source).toContain('import ballerina/workflow;');
            expect(source).toMatch(DECLARED);

            logStep('Checking the declaration carries what was typed');
            expect(source).toContain(AGENT_ROLE);
            expect(source).toContain(AGENT_INSTRUCTIONS);
            // The role and the instructions belong to the system prompt. Without this an
            // agent that carried the same text as some unrelated argument would still pass.
            expect(source).toMatch(/systemPrompt\s*:\s*\{[^}]*\brole\b\s*:/);
            expect(source).toMatch(/systemPrompt\s*:\s*\{[^}]*\binstructions\b\s*:/);

            logStep('Checking the model provider is a concrete declaration');
            // Unlike an ai:Agent, a durable agent is given a declared provider rather than an
            // inlined call, and the declared type has to be a concrete provider: every ai
            // component is identified in the diagram by its declared type, so an abstract
            // `ai:ModelProvider` would render as an unresolved node.
            const provider = source.match(/\bai:(\w*ModelProvider)\s+(\w+)\s*=/);
            expect(provider, `no declared model provider in:\n${source}`).not.toBeNull();
            expect(provider![1]).not.toBe('ModelProvider');
            expect(source).toMatch(new RegExp(`\\bmodel\\s*:\\s*${provider![2]}\\b`));
        });

        test('Registers a capability on the new agent', async () => {
            const webview = await getWebview(AGENT_BUILDER_LABEL, page);

            logStep('Opening the durable agent diagram');
            await openDurableAgent(webview);

            logStep('Opening the activity list from the agent box');
            await webview.getByTestId('durable-agent-add-activity').first().click({ force: true });
            const sidePanel = webview.getByTestId('side-panel');
            const createActivity = sidePanel.getByTestId('node-list-action-onAddFunction').first();
            await createActivity.waitFor({ state: 'visible', timeout: 60000 });

            logStep('Creating an activity from the list');
            await clickPanelControl(createActivity);
            const nameInput = webview.getByRole('textbox', { name: /Activity Name/ }).first();
            await nameInput.waitFor({ timeout: 60000 });
            await nameInput.fill(ACTIVITY_NAME);
            // The identifier field validates on blur and Save stays disabled until it has.
            await nameInput.press('Tab');
            const save = webview.getByRole('button', { name: 'Save' }).first();
            await expect.poll(() => save.getAttribute('disabled'), { timeout: 30000 }).toBeNull();
            await page.page.waitForTimeout(500);
            await save.click({ force: true });
            await settledSource(`function ${ACTIVITY_NAME}(`, 180000);

            logStep('Registering the activity on the agent');
            // The panel returns to the agent's activity list once the project has recompiled.
            await sidePanel.getByText(ACTIVITY_NAME, { exact: true }).first().waitFor({ timeout: 120000 });
            await clickListItem(sidePanel, ACTIVITY_NAME);
            await clickPanelControl(webview.getByRole('button', { name: 'Save' }).first());
            await waitForPanelToClose(webview);

            logStep('Checking the capability reached the agent declaration');
            await webview.getByTestId(`durable-agent-capability-activity-${ACTIVITY_NAME}`)
                .waitFor({ timeout: 60000 });
            expect(await settledSource(REGISTERED_ON_AGENT)).toMatch(REGISTERED_ON_AGENT);
        });

        test('Keeps the durable agent and its capability after a reload', async () => {
            logStep('Reloading the window');
            const overview = await reloadWindow();

            logStep('Checking the overview still shows the durable agent');
            await overview.getByText(AGENT_NAME, { exact: false }).first().waitFor({ timeout: 120000 });

            logStep('Checking the diagram still carries the capability');
            await openDurableAgent(overview);
            await overview.getByTestId(`durable-agent-capability-activity-${ACTIVITY_NAME}`)
                .waitFor({ timeout: 60000 });

            // The source is the real record; a stale webview could show what it cached.
            // Settled rather than read once: the reload re-opens the project and the generator
            // rewrites the files behind it, so a bare read here can catch one mid-write.
            const source = await settledSource(REGISTERED_ON_AGENT);
            expect(source).toMatch(DECLARED);
            expect(source).toMatch(REGISTERED_ON_AGENT);
        });
    });
}
