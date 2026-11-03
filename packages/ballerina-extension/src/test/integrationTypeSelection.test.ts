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
 * @jest-environment node
 *
 * Covers the scope-to-deploy-target resolution shared by the cloud deploy entry points.
 * The classification itself lives in `resolveIntegrationType` in @wso2/wso2-platform-core;
 * these assert the prompting behaviour the extension wraps around it.
 */

import { DevantScopes } from '@wso2/wso2-platform-core';
import { window } from './__mocks__/vscode';
import { confirmListenerAlongside, selectIntegrationType } from '../features/devant/integration-type';

const PROMPT = 'Select the artifact type to be deployed';
const pick = (scopes: DevantScopes[]) => selectIntegrationType(scopes, PROMPT);

const originalShowQuickPick = window.showQuickPick;
const originalShowWarningMessage = window.showWarningMessage;

let quickPickCalls: { items: string[]; placeHolder: string }[];
let warningCalls: string[];

/** Replaces the quick pick with one that records the call and answers with `answer`. */
function answerQuickPickWith(answer: string | undefined) {
    window.showQuickPick = (items: readonly string[], options?: { placeHolder?: string }) => {
        quickPickCalls.push({ items: [...items], placeHolder: options?.placeHolder });
        return Promise.resolve(answer);
    };
}

/** Replaces the warning modal with one that records the message and answers with `answer`. */
function answerWarningWith(answer: string | undefined) {
    window.showWarningMessage = (message: string) => {
        warningCalls.push(message);
        return Promise.resolve(answer);
    };
}

beforeEach(() => {
    quickPickCalls = [];
    warningCalls = [];
    answerQuickPickWith(undefined);
    answerWarningWith(undefined);
});

afterEach(() => {
    window.showQuickPick = originalShowQuickPick;
    window.showWarningMessage = originalShowWarningMessage;
});

describe('selectIntegrationType', () => {
    it.each([
        ['no scopes', [] as DevantScopes[]],
        ['an undefined scope list', undefined as unknown as DevantScopes[]],
    ])('returns undefined for %s without prompting', async (_case, scopes) => {
        await expect(pick(scopes)).resolves.toBeUndefined();
        expect(quickPickCalls).toHaveLength(0);
    });

    it.each([
        ['a workflow', DevantScopes.WORKFLOW],
        ['an automation', DevantScopes.AUTOMATION],
        ['an API integration', DevantScopes.INTEGRATION_AS_API],
    ])('auto-picks %s when it is the only scope', async (_case, scope) => {
        await expect(pick([scope])).resolves.toBe(scope);
        expect(quickPickCalls).toHaveLength(0);
    });

    // A workflow classifies as a service scope, so a listener alongside it is passive and the
    // workflow is picked without asking. This is what DevantScopes.WORKFLOW joining SERVICE_SCOPES
    // buys — before that, an unclassified scope forced the prompt every time.
    it.each([
        ['an event listener', DevantScopes.EVENT_INTEGRATION],
        ['a file listener', DevantScopes.FILE_INTEGRATION],
    ])('auto-picks a workflow accompanied by %s', async (_case, listener) => {
        await expect(pick([DevantScopes.WORKFLOW, listener])).resolves.toBe(DevantScopes.WORKFLOW);
        expect(quickPickCalls).toHaveLength(0);
    });

    it('prompts when a workflow and an API integration are both present', async () => {
        answerQuickPickWith(DevantScopes.WORKFLOW);

        await expect(pick([DevantScopes.INTEGRATION_AS_API, DevantScopes.WORKFLOW])).resolves.toBe(
            DevantScopes.WORKFLOW,
        );
        expect(quickPickCalls).toHaveLength(1);
    });

    it('offers every scope present, under the placeholder the caller passed', async () => {
        await pick([DevantScopes.INTEGRATION_AS_API, DevantScopes.WORKFLOW]);

        expect(quickPickCalls).toEqual([
            { items: [DevantScopes.INTEGRATION_AS_API, DevantScopes.WORKFLOW], placeHolder: PROMPT },
        ]);
    });

    it('returns undefined when the user dismisses the prompt', async () => {
        await expect(
            pick([DevantScopes.INTEGRATION_AS_API, DevantScopes.WORKFLOW]),
        ).resolves.toBeUndefined();
        expect(quickPickCalls).toHaveLength(1);
    });

    it('warns before picking an automation that runs alongside a listener', async () => {
        answerWarningWith('Continue');

        await expect(pick([DevantScopes.AUTOMATION, DevantScopes.EVENT_INTEGRATION])).resolves.toBe(
            DevantScopes.AUTOMATION,
        );
        expect(warningCalls).toHaveLength(1);
        expect(quickPickCalls).toHaveLength(0);
    });

    it('returns undefined when the automation-with-listener warning is dismissed', async () => {
        await expect(
            pick([DevantScopes.AUTOMATION, DevantScopes.EVENT_INTEGRATION]),
        ).resolves.toBeUndefined();
        expect(warningCalls).toHaveLength(1);
    });
});

// An entry point that prompts rather than auto-picking still has to warn, because the listener runs
// alongside the automation no matter how the type was decided.
describe('confirmListenerAlongside', () => {
    it('warns when an automation was chosen with a listener present', async () => {
        answerWarningWith('Continue');

        await expect(
            confirmListenerAlongside(
                [DevantScopes.AUTOMATION, DevantScopes.EVENT_INTEGRATION],
                DevantScopes.AUTOMATION,
            ),
        ).resolves.toBe(true);
        expect(warningCalls).toHaveLength(1);
    });

    it('reports false when the user backs out of the warning', async () => {
        await expect(
            confirmListenerAlongside(
                [DevantScopes.AUTOMATION, DevantScopes.EVENT_INTEGRATION],
                DevantScopes.AUTOMATION,
            ),
        ).resolves.toBe(false);
        expect(warningCalls).toHaveLength(1);
    });

    it('stays silent when the listener itself was the chosen type', async () => {
        await expect(
            confirmListenerAlongside(
                [DevantScopes.AUTOMATION, DevantScopes.EVENT_INTEGRATION],
                DevantScopes.EVENT_INTEGRATION,
            ),
        ).resolves.toBe(true);
        expect(warningCalls).toHaveLength(0);
    });

    it.each([
        ['an automation with no listener', [DevantScopes.AUTOMATION], DevantScopes.AUTOMATION],
        ['a lone workflow', [DevantScopes.WORKFLOW], DevantScopes.WORKFLOW],
    ])('stays silent for %s', async (_case, scopes, chosen) => {
        await expect(confirmListenerAlongside(scopes, chosen)).resolves.toBe(true);
        expect(warningCalls).toHaveLength(0);
    });

    // Parity boundary, not correctness: with a service scope in the mix resolveIntegrationType
    // returns `ask` rather than `autoPickWithWarning`, so no entry point warns here. Tracked
    // separately — closing it needs LISTENER_SCOPES exported from wso2-platform-core.
    it('does not warn for automation chosen alongside a service and a listener', async () => {
        await expect(
            confirmListenerAlongside(
                [DevantScopes.INTEGRATION_AS_API, DevantScopes.AUTOMATION, DevantScopes.EVENT_INTEGRATION],
                DevantScopes.AUTOMATION,
            ),
        ).resolves.toBe(true);
        expect(warningCalls).toHaveLength(0);
    });
});
