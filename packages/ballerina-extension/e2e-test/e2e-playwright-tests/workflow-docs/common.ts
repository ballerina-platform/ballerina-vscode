/**
 * Copyright (c) 2026, WSO2 LLC. (http://www.wso2.org)
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

import * as fs from 'fs';
import * as path from 'path';
import { FrameLocator, Locator } from '@playwright/test';
import { newProjectPath } from '../utils/helpers';
import { DocJourney } from './doc-journey';
import { escapeRegExp, Integrator } from './integrator';
import { findFile } from './project';

// The articles start inside a project, so they open a template: the order project the quickstart builds plus
// the workflows and activities the articles' examples use, or the claim-handling agent project.
export const ORDER_TEMPLATE = path.join(__dirname, '..', 'data', 'workflow_order_project');
export const AGENT_TEMPLATE = path.join(__dirname, '..', 'data', 'workflow_agent_project');
// The quickstarts build their project from scratch; these are the empty projects their Step 1 creates.
export const WORKFLOW_QUICKSTART_TEMPLATE = path.join(__dirname, '..', 'data', 'workflow_quickstart_project');
export const AGENT_QUICKSTART_TEMPLATE = path.join(__dirname, '..', 'data', 'agent_quickstart_project');

export const WORKFLOW_ARTICLES = 'develop-and-test/integration-artifacts/workflow/durable-workflow';
export const AGENT_ARTICLES = 'develop-and-test/integration-artifacts/workflow/durable-agentic-workflow';
export const QUICKSTARTS = 'get-started/quickstarts';

// The project's source, read fresh: one file found by name, or all of its top-level .bal files, since the designer may
// put a new artifact in a file of its own. Snippets are matched rather than whole files, so this is not
// verifyGeneratedSource.
export function projectSources(): (file?: string) => string {
    return (file?: string) => {
        if (file !== undefined) {
            const found = fs.existsSync(newProjectPath) ? findFile(newProjectPath, file) : undefined;
            return found ? fs.readFileSync(found, 'utf-8') : '';
        }
        return fs.readdirSync(newProjectPath).filter((f) => f.endsWith('.bal'))
            .map((f) => fs.readFileSync(path.join(newProjectPath, f), 'utf-8')).join('\n');
    };
}

// Waits for the project to load, then opens one of its artifacts from the sidebar.
export async function openArtifact(j: DocJourney, ui: Integrator, project: string, name: string,
    expect: string | RegExp = /Start/): Promise<FrameLocator> {
    await j.page.getByRole('treeitem', { name: new RegExp(`^${escapeRegExp(project)}`, 'i') }).first().waitFor({ state: 'visible', timeout: 180000 });
    await ui.sidebar(name);
    const opened = await ui.view(expect, 20000).catch(() => undefined);
    // Clicking the row that is already selected does not reopen it; the breadcrumb does.
    return opened ?? ui.crumb(name, expect);
}

// Picks the agent on a form's Durable Agentic Workflow field; a form that already shows it needs no pick. A form
// without the field is a product regression, so the step fails.
export async function selectAgent(j: DocJourney, ui: Integrator, panel: Locator, view: FrameLocator,
    agent = 'claimAgent'): Promise<void> {
    const picked = await ui.select(panel, view, 'Durable Agentic Workflow', agent).then(() => true).catch(() => false);
    if (!picked && !await panel.getByText(agent, { exact: true }).first().isVisible().catch(() => false)) {
        throw new Error(`Step ${j.stepId}: the form has no Durable Agentic Workflow field offering '${agent}'`);
    }
}
