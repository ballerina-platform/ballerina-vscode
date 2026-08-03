
/**
 * Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
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
import { createArtifactAndGetWebview, deleteArtifactFromTree, getWebview, BI_INTEGRATOR_LABEL, initTest, page } from '../utils/helpers';
import { Form } from '@wso2/playwright-vscode-tester';
import { ProjectExplorer } from '../utils/pages';
import { DEFAULT_PROJECT_NAME } from '../utils/helpers/constants';

// Titles use "AI Chat Service"; the product UI calls the same artifact
// "AI Chat Agent" (kept verbatim in the selectors below).
export default function createTests() {
    test.describe.serial('AI Chat Service Tests', {
    }, async () => {
        initTest();
        let sampleName: string;
        test('Create AI Chat Service', async ({ }, testInfo) => {
            const testAttempt = testInfo.retry + 1;
            console.log('Creating a new AI Chat Service in test attempt: ', testAttempt);

            const artifactWebView = await createArtifactAndGetWebview('AI Chat Agent', 'ai-agent-card');
            sampleName = `sample${testAttempt}`;
            const form = new Form(page.page, BI_INTEGRATOR_LABEL, artifactWebView);
            await form.switchToFormView(false, artifactWebView);
            await form.fill({
                values: {
                    "NameName of the agent (e.g. 'Customer Support Assistant', 'Sales Advisor', 'Data Analyst')": {
                        type: 'input',
                        value: sampleName,
                    }
                }
            });
            await form.submit('Create');
            console.log('AI Chat Service creation form submitted');

            // Check if the diagram canvas is visible
            const diagramCanvas = artifactWebView.locator('#bi-diagram-canvas');
            await diagramCanvas.waitFor({ state: 'visible', timeout: 240000 });

            const diagramTitle = artifactWebView.locator('h2', { hasText: 'AI Chat Agent' });
            await diagramTitle.waitFor();

            // Check if the agent call node is visible
            const agentCallNode = artifactWebView.locator('[data-testid="agent-call-node"]');
            await agentCallNode.waitFor();

            // Check if the service is created in the project explorer
            const projectExplorer = new ProjectExplorer(page.page);
            await projectExplorer.findItem([DEFAULT_PROJECT_NAME, `AI Agent Services - /${sampleName}`]);
        });

        test('Delete AI Chat Service', async ({ }, testInfo) => {
            const testAttempt = testInfo.retry + 1;
            console.log('Deleting an AI Chat Service in test attempt: ', testAttempt);

            await getWebview(BI_INTEGRATOR_LABEL, page);
            await deleteArtifactFromTree([DEFAULT_PROJECT_NAME, `AI Agent Services - /${sampleName}`]);
        });
    });
}
