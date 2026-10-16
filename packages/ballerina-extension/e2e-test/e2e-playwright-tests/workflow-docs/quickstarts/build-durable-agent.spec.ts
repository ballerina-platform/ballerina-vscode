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

import { expect, test } from '@playwright/test';
import { initTest } from '../../utils/helpers';
import { AGENT_QUICKSTART_TEMPLATE, projectSources, QUICKSTARTS, selectAgent } from '../common';
import { DocJourney } from '../doc-journey';
import { Integrator } from '../integrator';

// Follows "Build a Durable Agent" as written. Steps 6 to 11 run the agent on the WSO2 model, which needs a Copilot
// sign-in CI does not have, so they are recorded as not verified.


const INSTRUCTIONS = 'Process expense claims end to end. Validate each claim with validateClaim first and '
    + 'reject invalid claims with a clear reason. When a claim is valid, pay it with payClaim using the claimed '
    + 'amount. Finish with a one-line summary of the outcome.';

export default function createTests() {
    test.describe.serial('Build a Durable Agent Docs Tests', () => {
        initTest(true, true, undefined, undefined, AGENT_QUICKSTART_TEMPLATE);

        test('Build a Claim Handling Durable Agent', async () => {
            const j = new DocJourney({ title: 'Build a Durable Agent', slug: `${QUICKSTARTS}/build-durable-agent` });
            const ui = new Integrator(j);
            const source = projectSources();
            const allSource = () => ['agents.bal', 'workflows.bal', 'functions.bal', 'main.bal', 'types.bal'].map(source).join('\n');

            // Step 1 creates the project from the home page; the harness opens an empty project of the same name.
            let view = await ui.view(/Add Artifact/i, 180000);

            // ---------------------------------------------------------------- Step 2
            await j.step('2.1', 'In the design view, click **Add Artifact Manually**.', async () => {
                await ui.clickButton(view, 'Add Artifact Manually');
            });
            await j.step('2.2', 'Under **Durable Workflow**, select **Durable Agentic Workflow**. The **Create New Durable Agentic Workflow** form opens.', async () => {
                view = await ui.view('Durable Agentic Workflow');
                view = await ui.artifact(view, 'Durable Workflow', 'Durable Agentic Workflow', 'durable-agent');
                await view.getByText(/Create Agent/).first().waitFor();
            });
            await j.step('2.3', 'Set **Name** to `claimAgent`.', async () => {
                await ui.fill(view, 'Name', 'claimAgent');
            });
            await j.step('2.4', 'Leave **Model** on **Default WSO2 Model Provider**, the model your Copilot sign-in provides.', async () => {
                const model = await ui.field(view, 'Model').catch(() => undefined);
                if (!model) {
                    await j.finding({
                        kind: 'missing',
                        says: 'Leave **Model** on **Default WSO2 Model Provider**',
                        actual: 'The create form has no **Model** field',
                        suggestion: 'Say where the model is set, or drop the step if the default is implied.',
                    });
                    return;
                }
                const shown = (await model.innerText().catch(() => '')) || (await model.inputValue().catch(() => ''));
                if (!/Default WSO2 Model Provider/i.test(shown) && !await view.getByText(/Default WSO2 Model Provider/i).first().isVisible().catch(() => false)) {
                    await j.finding({
                        kind: 'label',
                        says: 'Leave **Model** on **Default WSO2 Model Provider**',
                        actual: `**Model** shows \`${shown.trim() || '(empty)'}\``,
                        suggestion: 'Name the default as the form shows it.',
                    });
                }
            });
            await j.step('2.5', 'Set **Role** to `Expense claim assistant`.', async () => {
                await ui.fill(view, 'Role', 'Expense claim assistant');
            });
            await j.step('2.6', 'Set **Instructions** to the claim-processing text.', async () => {
                await ui.fill(view, 'Instructions', INSTRUCTIONS);
                await ui.dismiss();
            });
            await j.step('2.7', '**Input Data Type** is the structured payload each run starts with. Create the claim record here: click the field, select **+ Create New Type**.', async () => {
                await j.click(await ui.field(view, 'Input Data Type'));
            });
            await ui.createRecordType(view, 'ExpenseClaim', [['claimId', 'string'], ['amount', 'decimal']], '2.7-8');
            await j.step('2.9', 'Click **Create Agent**.', async () => {
                await ui.dismiss();
                await ui.clickButton(view, 'Create Agent');
                view = await ui.view(/claimAgent/, 120000);
                await expect(view.getByTestId('durable-agent-run-node')).toBeVisible({ timeout: 120000 });
                await expect.poll(allSource, { timeout: 60000 }).toMatch(/workflow:DurableAgent claimAgent/);
            });

            // ---------------------------------------------------------------- Step 3
            await j.step('3.1.1', 'Click **+** on the activity anchor at the **bottom right** of the agent node. The **Activities** panel opens.', async () => {
                await openActivityAnchor(j, ui, true);
            });
            await j.step('3.1.2', 'Under **Current Integration**, click **+ Create Activity**. The **Workflow Activity** form opens.', async () => {
                await openCreateActivity(j, ui);
            });
            await createActivity(j, ui, '3.1', 'validateClaim', 'ExpenseClaim', 'expenseClaim', 'boolean');
            await j.step('3.1.6', 'Click the `validateClaim` form under **Current Integration**. Leave **Retry Policy** on **No Automatic Retry** and click **Save**.', async () => {
                await ui.clickText(await ui.panel('validateClaim'), 'validateClaim');
                const panel = await ui.panel(/Retry Policy/);
                await ui.select(panel, view, 'Retry Policy', { doc: 'No Automatic Retry', ui: 'No Retry' });
                await ui.saveForm();
                await expect.poll(allSource, { timeout: 60000 }).toMatch(/activities:\s*\[[^\]]*validateClaim/);
            });

            // Trees without the workflow groups list no activities, and the overview does not either.
            const canOpenActivity = await ui.treeRow('validateClaim') !== undefined;
            await j.step('3.2.1', 'In the left sidebar, expand **Workflow Activities** and select `validateClaim`.', async () => {
                if (!canOpenActivity) {
                    await j.finding({
                        kind: 'blocked',
                        says: 'Steps 3.2.1–3.2.4 edit `validateClaim` from **Workflow Activities** in the sidebar',
                        actual: 'Not verified here: this build\'s project tree has no **Workflow Activities** group',
                    });
                    return;
                }
                await ui.sidebar('validateClaim');
                view = await ui.view(/Start/);
            });
            await j.step('3.2.2', 'Click **+** on the flow diagram to open the node panel, then under **Control**, select **Return**.', async () => {
                if (!canOpenActivity) {
                    return;
                }
                await ui.plusBelow(view, 'Start');
                await ui.palette(['Control', 'Return']);
            });
            await j.step('3.2.3', 'Click the **Expression** field to open the value helper, then select **Inputs** > `expenseClaim` > `amount`.', async () => {
                if (!canOpenActivity) {
                    return;
                }
                const panel = await ui.panel(/Expression/);
                await ui.pick(panel, 'Expression', ['Inputs', 'expenseClaim', 'amount']);
            });
            await j.step('3.2.4', 'With the cursor after the inserted value, type `> 0d` to require a positive amount.', async () => {
                if (!canOpenActivity) {
                    return;
                }
                await ui.append(await ui.panel(/Return/), 'Expression', ' > 0d');
            });
            await j.step('3.2.5', 'Click **Save**, then select `claimAgent` under **Workflows** to return to the agent diagram.', async () => {
                if (canOpenActivity) {
                    await ui.saveForm();
                    await expect.poll(() => source('functions.bal'), { timeout: 60000 }).toMatch(/return expenseClaim\.amount > 0d;/);
                }
                // Where the sidebar lists the agent decides whether "under **Workflows**" holds.
                const agentRow = await ui.treeRow('claimAgent');
                await ui.sidebar('claimAgent');
                const parent = agentRow && await agentRow
                    .evaluate((row) => {
                        const level = Number(row.getAttribute('aria-level') ?? 0);
                        let prev = row.previousElementSibling;
                        while (prev && Number(prev.getAttribute('aria-level') ?? 0) >= level) {
                            prev = prev.previousElementSibling;
                        }
                        return prev?.getAttribute('aria-label') ?? '';
                    }).catch(() => '');
                if (parent && !/^Workflows/.test(parent)) {
                    await j.finding({
                        kind: 'label',
                        says: 'select `claimAgent` under **Workflows**',
                        actual: `\`claimAgent\` is listed under **${parent.split(/[,\s]/)[0]}** in the sidebar`,
                        suggestion: `Say "select \`claimAgent\` under **${parent.split(/[,\s]/)[0]}**". The same applies wherever the page points to the sidebar for the agent.`,
                    });
                }
                view = await ui.view(/claimAgent/);
            });

            await j.step('3.3.1', 'Click **+** on the activity anchor at the **bottom right** of the agent node, then under **Current Integration**, click the **+** icon to create the activity.', async () => {
                await openActivityAnchor(j, ui, false);
                await openCreateActivity(j, ui);
            });
            await createActivity(j, ui, '3.3', 'payClaim', 'ExpenseClaim', 'expenseClaim', '');
            await j.step('3.3.5', 'Click the `payClaim` form under **Current Integration** to open its register form, expand **Advanced Configurations**, and select **Requires Approval**.', async () => {
                await ui.clickText(await ui.panel('payClaim'), 'payClaim');
                const panel = await ui.panel(/Retry Policy/);
                const requiresApproval = panel.getByText(/Requires Approval/i);
                if (!await requiresApproval.first().isVisible().catch(() => false)) {
                    await j.finding({
                        kind: 'missing',
                        says: 'Expand **Advanced Configurations** and select **Requires Approval**, then set **Reviewer Roles**',
                        actual: 'There is no **Requires Approval** option. The register form has an **Approval Policy** dropdown in its main section; **Human Approval** there brings up **Reviewer Roles** and the rest of the review fields',
                        suggestion: 'Say "Set **Approval Policy** to **Human Approval**, then set **Reviewer Roles** to `Finance`". The code tab is also out of date: it is `approvalPolicy: {userRoles: "Finance"}`, not `requiresApproval: true, userRoles: "Finance"`.',
                    });
                    await ui.select(panel, (await ui.view()), 'Approval Policy', 'Human Approval');
                } else {
                    await j.click(requiresApproval.first());
                }
            });
            await j.step('3.3.6', 'Set **Reviewer Roles** to `Finance`, the roles permitted to decide that approval.', async () => {
                const panel = await ui.panel(/Reviewer Roles/);
                const roles = await ui.field(panel, 'Reviewer Roles');
                await j.click(roles);
                await j.typeFocused('Finance', false);
                await j.page.keyboard.press('Enter');
            });
            await j.step('3.3.7', 'Click **Save**.', async () => {
                await ui.saveForm();
                await expect.poll(allSource, { timeout: 60000 }).toMatch(/activity:\s*payClaim[\s\S]*Finance/);
            });

            // ---------------------------------------------------------------- Step 4
            await j.step('4.1', 'Click **+ Add Artifact**, then under **Integration as API**, click **HTTP Service**.', async () => {
                view = await ui.crumb('ClaimHandler', /Add Artifact/i).catch(() => ui.overview());
                await j.finding({
                    kind: 'gap',
                    says: '"Click **+ Add Artifact**"',
                    actual: 'After Step 3 the editor shows the agent\'s diagram; **+ Add Artifact** is on the integration overview',
                    suggestion: 'Start Step 4 with "Click **ClaimHandler** in the breadcrumb to open the integration overview", as Step 5.1 does.',
                });
                await ui.clickButton(view, '+ Add Artifact');
                view = await ui.view('Integration as API');
                view = await ui.artifact(view, 'Integration as API', 'HTTP Service', 'http-service-card');
            });
            await j.step('4.2', 'On the **Create HTTP Service** form, keep **Service Contract** on **Design From Scratch**, leave **Service Base Path** as `/`, and click **Create**.', async () => {
                view = await ui.view(/Service Base Path/i);
                await ui.clickButton(view, 'Create');
            });
            await j.step('4.3', 'The service opens with no resources. Click **+ Add Resource**.', async () => {
                view = await ui.view(/Add Resource/i, 120000);
                await ui.clickButton(view, '+ Add Resource');
            });
            await j.step('4.4', 'Set **HTTP Method** to **POST** and **Resource Path** to `claim`.', async () => {
                const frame = await ui.view();
                const list = frame.getByTestId('side-panel').filter({ hasText: 'Select HTTP Method to Add' }).last();
                if (await list.waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false)) {
                    await j.clickUntil(list.getByText('POST', { exact: true }).first(), frame.getByText('New Resource Configuration'));
                }
                await ui.fill(await ui.panel('New Resource Configuration'), 'Resource Path', 'claim');
            });
            await j.step('4.5', 'Click **+ Define Payload**, open the **Browse Existing Types** tab, select `ExpenseClaim` under the current integration, and click **Save**.', async () => {
                await ui.clickText(await ui.panel(), '+ Define Payload');
                const frame = await ui.view('Browse Existing Types');
                await ui.clickText(frame, 'Browse Existing Types');
                await ui.clickText(frame, 'ExpenseClaim');
                await j.click(frame.getByRole('button', { name: 'Save' }).last());
            });
            await j.step('4.6', 'Click **Save** to create the resource. Its own diagram opens.', async () => {
                await ui.saveForm();
                view = await ui.view(/Start/, 120000);
            });
            await j.step('4.7', 'Click **+**, then under **Workflow**, click **Run Durable Agent**.', async () => {
                await ui.plusBelow(view, 'Start');
                await ui.palette(['Workflow', 'Run Durable Agent']);
            });
            await j.step('4.8-10', 'Set **Durable Agentic Workflow** to `claimAgent`, **Query** to `Process Claim`, **Input** to the request `payload`; leave **Instance ID Variable Name** as `instanceId`. Click **Save**.', async () => {
                const panel = await ui.panel(/Query/);
                await selectAgent(j, ui, panel, view);
                await ui.fill(panel, 'Query', 'Process Claim');
                await ui.dismiss();
                await ui.pick(panel, 'Input', ['Inputs', 'payload']);
                await ui.saveForm();
                await expect.poll(() => source('main.bal'), { timeout: 60000 }).toMatch(/claimAgent\.run\(/);
            });
            await j.step('4.11', 'Click **+** below the node, click **Return** under **Control**, set **Expression** to `instanceId`, and click **Save**.', async () => {
                await ui.plusBelow(view, /Run Durable Agent|claimAgent|instanceId/);
                await ui.palette(['Control', 'Return']);
                await ui.pick(await ui.panel(/Expression/), 'Expression', ['Variables', 'instanceId']);
                await ui.saveForm();
                await expect.poll(() => source('main.bal'), { timeout: 60000 }).toMatch(/return instanceId;/);
            });

            // ---------------------------------------------------------------- Steps 6 to 11
            await j.step('6-11', 'Start Temporal, run the integration, submit a claim, approve it in ICP.', async () => {
                await j.finding({
                    kind: 'blocked',
                    says: 'Steps 6–11 run the agent on the **Default WSO2 Model Provider**',
                    actual: 'Not verified here: the model needs a WSO2 Integrator Copilot sign-in, which an unattended run with a fresh profile does not have',
                    suggestion: 'No change needed for the page. To verify, run this journey with a signed-in profile.',
                });
            });
        });
    });
}

// Steps 3.1.1 and 3.3.1: the activity anchor on the agent node, checked against "bottom right".
async function openActivityAnchor(j: DocJourney, ui: Integrator, checkPosition: boolean) {
    const view = await ui.view();
    const node = view.getByTestId('durable-agent-run-node').first();
    const anchor = view.getByTestId('durable-agent-affordance-activity').first();
    await anchor.waitFor({ state: 'visible', timeout: 60000 });
    if (checkPosition) {
        // The node's test id sits on a wrapper wider than the box, so compare with the other anchors on its edge.
        const left = await view.getByTestId('durable-agent-affordance-humanTask').first().boundingBox();
        const title = await node.getByText(/Agent$/).first().boundingBox();
        const a = await anchor.boundingBox();
        if (left && title && a) {
            const right = a.x - left.x > 150;
            const bottom = a.y - title.y > 100;
            if (!(right && bottom)) {
                const where = `${bottom ? 'bottom' : 'top'} ${right ? 'right' : 'left'}`;
                await j.finding({
                    kind: 'label',
                    says: 'the activity anchor at the **bottom right** of the agent node',
                    actual: `The activity anchor is at the **${where}** of the agent node`,
                    suggestion: `Say "the activity anchor at the ${where} of the agent node".`,
                });
            }
        }
    }
    await j.click(anchor);
    await ui.panel('Current Integration');
}

// Opens the Workflow Activity form from the Activities panel.
async function openCreateActivity(j: DocJourney, ui: Integrator) {
    const panel = await ui.panel('Current Integration');
    const link = panel.getByText(/^\+?\s*Create Activity$/).first();
    await link.waitFor({ state: 'visible', timeout: 30000 }).catch(() => undefined);
    const target = await link.isVisible().catch(() => false) ? link : panel.getByTestId('node-list-action-onAddFunction');
    // A click that lands while the list re-renders is dropped; retry until the form shows.
    await j.clickUntil(target, (await ui.view()).getByText(/Activity Name/).filter({ visible: true }));
}

// The Workflow Activity form: name, one parameter, an optional return type, Save.
async function createActivity(j: DocJourney, ui: Integrator, step: string, name: string, type: string, param: string,
    returnType: string) {
    await j.step(`${step}.3`, `Set **Activity Name** to \`${name}\`.`, async () => {
        const panel = await ui.panel(/Activity Name/);
        await j.page.waitForTimeout(1500);
        await ui.fill(panel, 'Activity Name', name);
    });
    await j.step(`${step}.4`, `Under **Parameters**, click **+ Add Parameter**. Set **Type** to \`${type}\` and **Name** to \`${param}\`, then click **Add**.`, async () => {
        const panel = await ui.panel();
        await ui.clickText(panel, '+ Add Parameter');
        await ui.fill(panel, 'Type', type);
        await ui.dismiss();
        await ui.fill(panel, 'Name', param);
        const cancel = panel.getByRole('button', { name: 'Cancel' });
        for (let attempt = 0; attempt < 3; attempt++) {
            await j.page.waitForTimeout(600);
            await ui.clickButton(panel, 'Add');
            if (await cancel.waitFor({ state: 'hidden', timeout: 5000 }).then(() => true).catch(() => false)) {
                break;
            }
        }
    });
    await j.step(`${step}.5`, returnType ? `Set **Return Type** to \`${returnType}\` and click **Save**.` : 'Leave **Return Type** empty and click **Save**.', async () => {
        const panel = await ui.panel();
        if (returnType) {
            await ui.fill(panel, 'Return Type', returnType);
            await ui.dismiss();
        }
        const nameBox = await ui.field(panel, 'Activity Name');
        const value = () => nameBox.locator('input').inputValue().catch(() => nameBox.inputValue()).catch(() => '');
        for (let attempt = 0; attempt < 3; attempt++) {
            if (await value() !== name) {
                await ui.fill(panel, 'Activity Name', name);
                await j.page.waitForTimeout(1500);
                continue;
            }
            await ui.clickButton(panel, 'Save');
            if (await (await ui.view()).getByText(name, { exact: true }).first()
                .waitFor({ state: 'visible', timeout: 60000 }).then(() => true).catch(() => false)) {
                return;
            }
        }
        throw new Error(`the ${name} activity was not created`);
    });
}
