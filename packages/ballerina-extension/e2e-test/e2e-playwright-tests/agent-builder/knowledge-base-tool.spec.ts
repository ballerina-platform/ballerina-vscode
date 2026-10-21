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
import type { Frame } from '@playwright/test';
import path from 'path';
import { AGENT_BUILDER_LABEL, getWebview, initTest, logStep, page } from '../utils/helpers';
import {
    AGENT_BUILDER_MODE,
    chooseInPanel,
    clickButton,
    fillField,
    panelText,
    reloadWindow,
    settledSource,
    waitForPanelReady,
} from './agentForm';

// L4, journey 4 of docs/agent-builder-test-plan.md: give an agent a retrieval tool over a
// knowledge base and prove the tool and the resource it reads reach source and survive a
// reopen.
//
// The project is seeded with an agent and an in-memory knowledge base rather than built up
// through the UI. The plan's journey is "select or create a knowledge base", and selecting an
// existing one is both the branch worth guarding here and the one this repository owns:
// creating a knowledge base from scratch means creating a vector store and an embedding
// provider first, three nested modals whose own forms belong to the connection wizard rather
// than to Agent Builder.
//
// The template carries only what the journey needs — Ballerina.toml, agents.bal and the
// `ballerina.isBI` setting. Its siblings also carry the empty connections.bal/functions.bal
// scaffold a generated project comes with; those are left out here because the generator
// creates what it writes to, and an empty file in a fixture reads as if it mattered.
const PROJECT_TEMPLATE = path.join(__dirname, '..', 'data', 'agent_knowledge_base_project');

const AGENT_NAME = 'librarianAgent';
const KNOWLEDGE_BASE = 'handbookKnowledgeBase';
const TOOL_NAME = 'searchHandbook';

// Adding a tool is two writes: the tool's function first, then its registration on the agent.
// Both the wait and the assertion use this so a slow second write cannot be mistaken for a
// finished one.
const REGISTERED_ON_AGENT = new RegExp(`tools\\s*=\\s*\\[[^\\]]*\\b${TOOL_NAME}\\b`);

/** Brings the agent's own diagram up, whichever view the panel left behind. */
async function openAgentDiagram(webview: Frame): Promise<void> {
    const agentNode = webview.getByTestId('agent-node').first();
    if (await agentNode.isVisible()) {
        return;
    }
    const entry = webview.getByText(AGENT_NAME, { exact: true }).first();
    await entry.waitFor({ timeout: 120000 });
    await entry.click({ force: true });
    await agentNode.waitFor({ state: 'visible', timeout: 60000 });
}

export default function knowledgeBaseToolTests() {
    test.describe.serial('Add a knowledge base tool', {
    }, async () => {
        test.skip(
            process.env.WSO2_PRODUCT_MODE !== AGENT_BUILDER_MODE,
            `Needs WSO2_PRODUCT_MODE=${AGENT_BUILDER_MODE} at VS Code launch (pnpm run e2e-test:agent-builder)`
        );
        initTest(true, true, undefined, undefined, PROJECT_TEMPLATE);

        test('Offers the project knowledge base and only its retrieval action', async () => {
            const webview = await getWebview(AGENT_BUILDER_LABEL, page);

            logStep('Opening the agent diagram');
            await openAgentDiagram(webview);

            logStep('Opening the Add Tool panel');
            await webview.getByTestId('agent-add-tool').first().click({ force: true });
            const routes = await waitForPanelReady(webview);
            expect(routes).toContain('Use Knowledge Base');

            logStep('Choosing the knowledge base route');
            await chooseInPanel(webview, 'Use Knowledge Base');
            const bases = await waitForPanelReady(webview, routes);

            // The seeded knowledge base is listed as an instance of the project, which is what
            // "select an existing knowledge base" means; the types below it are the create path.
            logStep('Checking the project knowledge base is offered');
            expect(bases).toContain(KNOWLEDGE_BASE);

            logStep('Selecting the project knowledge base');
            await chooseInPanel(webview, KNOWLEDGE_BASE);
            const actions = await waitForPanelReady(webview, bases);

            // The plan asks that only supported retrieval actions are offered as agent tools.
            logStep('Checking only the retrieval action is offered');
            expect(actions).toContain('Retrieve');
            expect(actions.toLowerCase()).not.toContain('ingest');
        });

        test('Saves the tool against the selected knowledge base', async () => {
            const webview = await getWebview(AGENT_BUILDER_LABEL, page);

            logStep('Opening the retrieve action');
            const actions = await panelText(webview);
            await chooseInPanel(webview, 'Retrieve');
            const form = await waitForPanelReady(webview, actions);

            // The form is opened on the knowledge base that was picked, so the instance it
            // will generate against is already decided; only the tool's own name is missing.
            logStep('Checking the form is bound to the selected knowledge base');
            expect(form).toContain(KNOWLEDGE_BASE);

            logStep('Naming the tool');
            await fillField(webview, 'Tool Name', TOOL_NAME);

            logStep('Saving the tool');
            await clickButton(webview, /^Save Tool$/i);

            logStep('Waiting for the tool to be registered on the agent');
            await settledSource(REGISTERED_ON_AGENT);
        });

        test('Writes a retrieval tool bound to the knowledge base', async () => {
            const source = await settledSource(REGISTERED_ON_AGENT);

            logStep('Checking the agent was given the tool');
            expect(source).toMatch(REGISTERED_ON_AGENT);

            logStep('Checking the tool retrieves from the selected knowledge base');
            const tool = source.slice(source.indexOf(`function ${TOOL_NAME}`));
            expect(tool).toContain(KNOWLEDGE_BASE);
            expect(tool).toMatch(/\.retrieve\(/);

            // The knowledge base was already in the project; adding a tool must not have
            // replaced it with a second one.
            logStep('Checking the existing knowledge base was reused, not duplicated');
            expect(source.match(new RegExp(`ai:VectorKnowledgeBase\\s+\\w+\\s*=`, 'g')) ?? []).toHaveLength(1);
        });

        test('Keeps the tool after a reload', async () => {
            logStep('Reloading the window');
            const webview = await reloadWindow();

            logStep('Checking the agent diagram still shows the tool');
            await openAgentDiagram(webview);
            await webview.getByText(TOOL_NAME, { exact: false }).first().waitFor({ timeout: 120000 });

            // The source is the real record; a stale webview could show what it cached.
            // Settled rather than read once: the reload re-opens the project and the generator
            // rewrites the files behind it, so a bare read here can catch one mid-write.
            expect(await settledSource(REGISTERED_ON_AGENT)).toMatch(REGISTERED_ON_AGENT);
        });
    });
}
