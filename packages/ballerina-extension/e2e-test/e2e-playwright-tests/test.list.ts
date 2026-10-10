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

/// <reference types="node" />

import { test } from '@playwright/test';
import * as helpers from './utils/helpers';
import { extensionsFolder, newProjectPath, zipProjectSnapshot } from './utils/helpers';
import { downloadExtensionFromMarketplace } from '@wso2/playwright-vscode-tester';
import fs from 'fs';
import { execSync } from 'child_process';
import path from 'path';
const videosFolder = path.join(__dirname, '..', 'test-resources', 'videos');
const VIDEO_SAVE_TIMEOUT_MS = Number(process.env.BI_E2E_VIDEO_SAVE_TIMEOUT_MS ?? 20000);
const PAGE_CLOSE_TIMEOUT_MS = Number(process.env.BI_E2E_PAGE_CLOSE_TIMEOUT_MS ?? 10000);
const ELECTRON_EXIT_WAIT_MS = Number(process.env.BI_E2E_ELECTRON_EXIT_WAIT_MS ?? 5000);

// Whether a process id is still running.
function isAlive(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

/**
 * Kills VS Code with everything it started. Playwright launches Electron as the leader of its own process group
 * (not on Windows), so signalling the group also ends the extension host and the language servers it spawned,
 * which otherwise outlive a killed main process. The pid recorded at launch is the fallback for an application
 * handle that is already disposed, where `process()` throws.
 */
async function terminateVsCode(): Promise<void> {
    let electronProcess: import('child_process').ChildProcess | undefined;
    try {
        electronProcess = helpers.vscode?.process?.();
    } catch {
        electronProcess = undefined;
    }
    const pid = electronProcess?.pid ?? helpers.vscodePid;
    if (!pid || !isAlive(pid)) {
        console.log('ℹ️  No live Electron process to terminate');
        return;
    }
    const exited = new Promise<void>((resolve) => {
        const deadline = Date.now() + ELECTRON_EXIT_WAIT_MS;
        const poll = setInterval(() => {
            if (!isAlive(pid) || Date.now() > deadline) {
                clearInterval(poll);
                resolve();
            }
        }, 200);
        electronProcess?.once('exit', () => {
            clearInterval(poll);
            resolve();
        });
    });
    if (process.platform === 'win32') {
        // /T takes the child tree with it; Windows has no process groups to signal.
        try {
            execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore' });
        } catch {
            // Already gone.
        }
    } else {
        try {
            process.kill(-pid, 'SIGKILL');
        } catch {
            try {
                process.kill(pid, 'SIGKILL');
            } catch {
                // Already gone.
            }
        }
    }
    await exited;
    console.log(isAlive(pid) ? '⚠️  VS Code Electron app still running after SIGKILL' : '✅ VS Code Electron app terminated');
}
const WORKER_FORCE_EXIT_MS = Number(process.env.BI_E2E_WORKER_FORCE_EXIT_MS ?? 8000);

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
    return Promise.race([
        operation,
        new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
        }),
    ]);
}

import automation from './automation/automation.spec';
import automationRun from './rundebug/run/automation-run.spec';
import runConflict from './rundebug/run-conflict/run-conflict.spec';
import runConcurrent from './rundebug/run-concurrent/run-concurrent.spec';
import automationDebug from './rundebug/debug/automation-debug.spec';
import expressionEditor from './expression-editor/expression-editor.spec';
import expressionEditorAdvanced from './expression-editor/expression-editor-advanced.spec';
import expressionEditorParamChipEdit from './expression-editor/expression-editor-param-chip-edit.spec';
import optionalFieldAccess from './expression-editor/optional-field-access.spec';

import httpService from './api-integration/http-service.spec';
import httpUpload from './api-integration/http-upload.spec';
import aiChatService from './api-integration/ai-chat-service.spec';
import graphqlService from './api-integration/graphql-service.spec';
import tcpService from './api-integration/tcp-service.spec';

import kafkaIntegration from './event-integration/kafka.spec';
import rabbitmqIntegration from './event-integration/rabbitmq.spec';
import mqttIntegration from './event-integration/mqtt.spec';
import azureIntegration from './event-integration/azure.spec';
import salesforceIntegration from './event-integration/salesforce.spec';
import twillioIntegration from './event-integration/twillio.spec';
import githubIntegration from './event-integration/github.spec';

import ftpIntegration from './file-integration/ftp.spec';
import directoryIntegration from './file-integration/directory.spec';

import functionArtifact from './other-artifacts/function.spec';
import naturalFunctionArtifact from './other-artifacts/np.spec';
import connections from './connections/connections.spec';

import configuration from './configuration/configuration.spec';
import typeTest from './type-editor/type.spec';
import typeExplorerNavigationTest from './type-editor/type-explorer-navigation.spec';
import serviceClassEditingTest from './type-editor/service-class-editing.spec';
import serviceClassInitTest from './type-editor/service-class-init-config.spec';

import importIntegration from './import-integration/import-integration.spec';

import reusableDataMapper from './datamapper/reusable-data-mapper.spec';
import inlineDataMapper from './datamapper/inline-data-mapper.spec';

import createProject from './project-overview/project-creation.spec';

import diagram from './diagram/diagram.spec';
import durableAgentActivity from './workflow/durable-agent-activity.spec';
import durableAgentRoleFields from './workflow/durable-agent-role-fields.spec';
import workflowRoleFields from './workflow/workflow-role-fields.spec';
import automationFlowNodes from './diagram/flow-nodes.spec';

import httpTryItExisting from './tryit/http-try-it-existing.spec';

import testExplorer from './test-explorer/test-explorer.spec';

import docsBuildDurableWorkflow from './workflow-docs/quickstarts/build-durable-workflow.spec';
import docsBuildDurableAgent from './workflow-docs/quickstarts/build-durable-agent.spec';
import docsCreateWorkflow from './workflow-docs/durable-workflow/create.spec';
import docsStartWorkflow from './workflow-docs/durable-workflow/start.spec';
import docsActivities from './workflow-docs/durable-workflow/activities.spec';
import docsPrebuiltActivities from './workflow-docs/durable-workflow/prebuilt-activities.spec';
import docsDataEvents from './workflow-docs/durable-workflow/data-events.spec';
import docsSendDataEvent from './workflow-docs/durable-workflow/send-data-event.spec';
import docsAwaitHumanTask from './workflow-docs/durable-workflow/await-human-task.spec';
import docsDurableTimers from './workflow-docs/durable-workflow/durable-timers.spec';
import docsErrorHandling from './workflow-docs/durable-workflow/review-activity-and-error-handling.spec';
import docsDeploymentModes from './workflow-docs/durable-workflow/deployment-modes.spec';
import docsManagementApi from './workflow-docs/durable-workflow/management-api.spec';
import docsCreateDurableAgent from './workflow-docs/durable-agentic-workflow/create-durable-agent.spec';
import docsRunDurableAgent from './workflow-docs/durable-agentic-workflow/run-durable-agent.spec';
import docsSendAgentDataEvent from './workflow-docs/durable-agentic-workflow/send-agent-data-event.spec';
import docsGetAgentResult from './workflow-docs/durable-agentic-workflow/get-agent-result.spec';
import docsGetDataEventResult from './workflow-docs/durable-agentic-workflow/get-data-event-result.spec';

import projectExplorer from './project-explorer/project-explorer.spec';

test.describe.configure({ mode: 'default' });

test.beforeAll(async () => {
    if (fs.existsSync(videosFolder)) {
        fs.rmSync(videosFolder, { recursive: true, force: true });
    }
    console.log('\n' + '='.repeat(80));
    console.log('🚀 STARTING BI EXTENSION E2E TEST SUITE');
    console.log('='.repeat(80) + '\n');

    // Download VSIX if flag is set
    if (process.env.DOWNLOAD_PRERELEASE === 'true') {
        console.log('📦 Downloading BI prerelease VSIXs ...');
        try {
            await downloadExtensionFromMarketplace('wso2.ballerina@prerelease', extensionsFolder);
            await downloadExtensionFromMarketplace('wso2.ballerina-integrator@prerelease', extensionsFolder);
            console.log('✅ BI prerelease VSIXs are ready!');
        } catch (error) {
            console.error('❌ Failed to download BI prerelease VSIXs:', error);
            throw error;
        }
    }
});

test.describe('Ballerina E2E Group 1', { tag: '@group1' }, async () => {
    // <----Create Project Test---->
    test.describe(createProject);

    // <----Automation Test---->
    test.describe(automation);
    test.describe(automationFlowNodes);

    // <----Automation Run Test---->
    test.describe(automationRun);

    // <----Run Conflict (Same-Integration Restart) Test---->
    test.describe(runConflict);

    // <----Concurrent Run Test---->
    test.describe(runConcurrent);

    // <----Integration as API Test---->
    test.describe(httpService);
    test.describe(httpUpload);

    // <----Event Integration Test---->
    test.describe(kafkaIntegration);

    // <----File Integration Test---->
    test.describe(ftpIntegration);
});

test.describe('Ballerina E2E Group 2', { tag: '@group2' }, async () => {
    // <----Automation Debug Test---->
    test.describe(automationDebug);

    // <----AI Chat Service Test---->
    // TODO: flaky - wso2/product-integrator#2389 (#bi-diagram-canvas never becomes visible after create)
    test.describe.skip(aiChatService);

    // <----Integration as API Test---->
    // TODO: flaky - wso2/product-integrator#2389 ('graphql-add-mutation-btn' not visible
    // within 10s).
    test.describe.skip(graphqlService);

    // <----Event Integration Test---->
    test.describe(rabbitmqIntegration);
    test.describe(salesforceIntegration);

    // <----File Integration Test---->
    test.describe(directoryIntegration);

    // <----Other Artifacts Test---->
    test.describe(functionArtifact);

    // <----Project Explorer Test---->
    test.describe(projectExplorer);

    // <----Workflow Test---->
    test.describe(workflowRoleFields);
});

test.describe('Ballerina E2E Group 3', { tag: '@group3' }, async () => {
    // <----Integration as API Test---->
    test.describe(tcpService);
    test.describe(httpTryItExisting);

    // <----Event Integration Test---->
    test.describe(mqttIntegration);
    test.describe(twillioIntegration);

    // <----Other Artifacts Test---->
    test.describe.skip(naturalFunctionArtifact); // TODO: Enable this once the ballerina version is switchable
    test.describe(configuration);

    // <----Import Integration Test---->
    test.describe.skip(importIntegration);

    // <----Data Mapper Test---->
    test.describe(reusableDataMapper);

    // <----Expression Editor Test---->
    test.describe(expressionEditor);
    test.describe(expressionEditorAdvanced);
    test.describe(expressionEditorParamChipEdit);
    test.describe(optionalFieldAccess);
});

test.describe('Ballerina E2E Group 4', { tag: '@group4' }, async () => {
    // <----Event Integration Test---->
    test.describe(githubIntegration);
    test.describe(azureIntegration);

    // <----Other Artifacts Test---->
    test.describe(typeTest);
    test.describe(typeExplorerNavigationTest);
    test.describe(serviceClassEditingTest);
    test.describe(serviceClassInitTest);

    // <----Data Mapper Test---->
    test.describe.skip(inlineDataMapper); // Failing due to a issue

    // <----Diagram Test---->
    test.describe(diagram);
    test.describe(durableAgentActivity);
    test.describe(durableAgentRoleFields);

    // <----Test Explorer Test---->
    test.describe(testExplorer);

    test.describe(connections);
});

// Each workflow docs page followed as written; differences from the page are reported as doc-finding annotations.
test.describe('Ballerina E2E Group 5', { tag: '@group5' }, async () => {
    // <----Workflow Docs: Quickstarts---->
    test.describe(docsBuildDurableWorkflow);
    test.describe(docsBuildDurableAgent);

    // <----Workflow Docs: Durable Workflow---->
    test.describe(docsCreateWorkflow);
    test.describe(docsStartWorkflow);
    test.describe(docsActivities);
    test.describe(docsPrebuiltActivities);
    test.describe(docsDataEvents);
    test.describe(docsSendDataEvent);
    test.describe(docsAwaitHumanTask);
    test.describe(docsDurableTimers);
    test.describe(docsErrorHandling);
    test.describe(docsDeploymentModes);
    test.describe(docsManagementApi);

    // <----Workflow Docs: Durable Agentic Workflow---->
    test.describe(docsCreateDurableAgent);
    test.describe(docsRunDurableAgent);
    test.describe(docsSendAgentDataEvent);
    test.describe(docsGetAgentResult);
    test.describe(docsGetDataEventResult);
});

test.afterAll(async () => {
    console.log('\n' + '='.repeat(80));
    console.log('✅ BI EXTENSION E2E TEST SUITE COMPLETED');
    console.log('='.repeat(80));

    const dateTime = new Date().toISOString().replace(/:/g, '-');
    console.log('💾 Saving test video...');
    try {
        const activePage = helpers.page?.page;
        if (activePage) {
            const video = activePage.video();

            // Close the window first so the video recording is finalized on
            // disk. `video.saveAs()` only resolves after the page owning the
            // recording has closed, so we MUST close the page before awaiting
            // the save — regardless of whether the last test passed or failed.
            // (Leaving the window open on failure, as the previous workaround
            // did, ends up hanging the worker: see the vscode.close() comment
            // below for why the worker cannot exit while Electron is alive.)
            await withTimeout(
                activePage.close(),
                PAGE_CLOSE_TIMEOUT_MS,
                `Page close timed out after ${PAGE_CLOSE_TIMEOUT_MS}ms`
            ).catch((err) => {
                console.warn(`ℹ️  Page close skipped: ${(err as Error).message}`);
            });

            if (video) {
                fs.mkdirSync(videosFolder, { recursive: true });
                const videoFilePath = path.join(videosFolder, `test_${dateTime}.webm`);
                try {
                    await withTimeout(
                        video.saveAs(videoFilePath),
                        VIDEO_SAVE_TIMEOUT_MS,
                        `Video save timed out after ${VIDEO_SAVE_TIMEOUT_MS}ms`
                    );
                    console.log(`✅ Video saved successfully (${videoFilePath})`);
                } catch (err) {
                    console.warn(`⚠️  Video save failed: ${(err as Error).message}`);
                }
            } else {
                console.log('ℹ️  No video available to save');
            }
        } else {
            console.log('ℹ️  No active browser page found, skipping video save');
        }
    } catch (error) {
        console.warn('⚠️  Failed to save/close test video page, continuing cleanup...', error);
    }

    // Snapshot the project when the suite is interrupted (e.g. manually stopped)
    zipProjectSnapshot('suite_teardown');

    // Terminate the VS Code Electron subprocess so the worker's Node event
    // loop can exit.
    //
    // Why SIGKILL instead of `vscode.close()`:
    //   After a failing test, VS Code often has a running task (e.g. the
    //   "Run Integration" terminal child) or a modal that blocks graceful
    //   quit. `electronApp.close()` then hangs until its own timeout, and
    //   Playwright's internal close-in-flight promises leave Node-side
    //   handles in a state that keeps the worker's event loop alive.
    //   We've already captured the screenshot, project snapshot, and video
    //   above — nothing else needs a clean quit here.
    //
    // Why closing at all is REQUIRED (not optional):
    //   `_electron.launch()` opens an IPC pipe between the Playwright
    //   worker (Node) and the Electron main process. While the pipe is
    //   open, the worker process cannot exit — even after afterAll
    //   returns. Playwright waits for the current worker to exit before
    //   spawning the retry worker; a stuck worker freezes the entire run
    //   (no retry, no next test, `pnpm run e2e-test` hangs).
    //
    // Each retry / next worker starts fresh (new Node process, re-imports
    // modules, runs beforeAll -> initVSCode -> launches a new Electron),
    // so tearing Electron down here is safe and does not interfere with
    // retries.
    if (helpers.vscode || helpers.vscodePid) {
        console.log('🛑 Terminating VS Code Electron app...');
        try {
            await terminateVsCode();
        } catch (err) {
            console.warn(`⚠️  Failed to terminate Electron: ${(err as Error).message}`);
        }
    }

    // Clean up the test project directory
    console.log('🧹 Cleaning up test project...');
    if (fs.existsSync(newProjectPath)) {
        try {
            fs.rmSync(newProjectPath, { recursive: true, force: true });
            console.log('✅ Test project cleaned up successfully\n');
        } catch (error) {
            console.error('❌ Failed to clean up test project:', error);
            console.log('⚠️  Test project cleanup failed, but continuing...\n');
        }
    } else {
        console.log('ℹ️  Test project directory does not exist, skipping cleanup\n');
    }

    // Safety net: if Playwright's internal handles still keep the event loop
    // alive after we've torn everything down (observed on failing tests),
    // force-exit so the retry worker can actually spawn. `unref()` means the
    // timer itself does NOT keep the loop alive — if the loop can exit
    // naturally it will, and Playwright sees a normal worker exit. We only
    // hit `process.exit()` when the loop is genuinely stuck.
    const forceExitTimer = setTimeout(() => {
        console.log(`⚡ Worker event loop still alive ${WORKER_FORCE_EXIT_MS}ms after teardown — force-exiting so Playwright can spawn the retry worker`);
        process.exit(0);
    }, WORKER_FORCE_EXIT_MS);
    forceExitTimer.unref();
});
