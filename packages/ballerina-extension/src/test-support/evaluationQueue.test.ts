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

jest.mock('vscode', () => {
    class CancellationTokenSource {
        token = { isCancellationRequested: false };
        cancel() { this.token.isCancellationRequested = true; }
        dispose() { }
    }
    return { CancellationTokenSource, window: { showErrorMessage: jest.fn() } };
});
jest.mock('../RPCLayer', () => ({ notifyEvaluationRunStateChanged: jest.fn() }));
jest.mock('../features/test-explorer/runner', () => ({ runEvaluations: jest.fn() }));

import { window } from 'vscode';
import { runEvaluations } from '../features/test-explorer/runner';
import { getEvaluationRunState, queueEvaluations, stopEvaluations } from '../features/test-explorer/evaluation-queue';

const PROJECT = '/project';
const runMock = runEvaluations as jest.Mock;

let finishRun: Array<(error?: Error) => void>;

const flush = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
    finishRun = [];
    runMock.mockReset().mockImplementation(() => new Promise<void>((resolve, reject) => {
        finishRun.push((error) => (error ? reject(error) : resolve()));
    }));
    (window.showErrorMessage as jest.Mock).mockReset();
});

describe('evaluation queue', () => {
    it('runs evaluations clicked during a run together, after the run ends', async () => {
        queueEvaluations(PROJECT, ['a']);
        queueEvaluations(PROJECT, ['b']);
        queueEvaluations(PROJECT, ['c', 'b', 'a']);

        expect(runMock).toHaveBeenCalledTimes(1);
        expect(getEvaluationRunState(PROJECT)).toEqual({ projectPath: PROJECT, running: ['a'], queued: ['b', 'c'], stopping: [] });

        finishRun[0]();
        await flush();
        expect(runMock).toHaveBeenLastCalledWith(PROJECT, ['b', 'c'], expect.anything());

        finishRun[1]();
        await flush();
        expect(runMock).toHaveBeenCalledTimes(2);
        expect(getEvaluationRunState(PROJECT)).toEqual({ projectPath: PROJECT, running: [], queued: [], stopping: [] });
    });

    it('stop all cancels the current run and drops the queue', async () => {
        queueEvaluations(PROJECT, ['a']);
        queueEvaluations(PROJECT, ['b']);
        const token = runMock.mock.calls[0][2];

        stopEvaluations(PROJECT);
        expect(token.isCancellationRequested).toBe(true);
        expect(getEvaluationRunState(PROJECT)).toMatchObject({ running: [], queued: [], stopping: ['a'] });

        finishRun[0]();
        await flush();
        expect(runMock).toHaveBeenCalledTimes(1);
        expect(getEvaluationRunState(PROJECT).stopping).toEqual([]);
    });

    it('removes a queued evaluation without touching the current run', async () => {
        queueEvaluations(PROJECT, ['a']);
        queueEvaluations(PROJECT, ['b', 'c']);
        const token = runMock.mock.calls[0][2];

        stopEvaluations(PROJECT, ['b']);
        expect(token.isCancellationRequested).toBe(false);
        expect(getEvaluationRunState(PROJECT)).toMatchObject({ running: ['a'], queued: ['c'] });

        finishRun[0]();
        await flush();
        expect(runMock).toHaveBeenLastCalledWith(PROJECT, ['c'], expect.anything());
        finishRun[1]();
        await flush();
    });

    it('stopping one evaluation of a run queues the rest of that run again', async () => {
        queueEvaluations(PROJECT, ['a', 'b']);
        queueEvaluations(PROJECT, ['c']);
        const token = runMock.mock.calls[0][2];

        stopEvaluations(PROJECT, ['a']);
        expect(token.isCancellationRequested).toBe(true);
        expect(getEvaluationRunState(PROJECT)).toMatchObject({ running: [], queued: ['b', 'c'], stopping: ['a'] });

        finishRun[0]();
        await flush();
        expect(runMock).toHaveBeenLastCalledWith(PROJECT, ['b', 'c'], expect.anything());
        finishRun[1]();
        await flush();
    });

    it('queues an evaluation again while it is still stopping', async () => {
        queueEvaluations(PROJECT, ['a']);
        stopEvaluations(PROJECT, ['a']);
        queueEvaluations(PROJECT, ['a']);
        expect(getEvaluationRunState(PROJECT)).toMatchObject({ queued: ['a'], stopping: ['a'] });

        finishRun[0]();
        await flush();
        expect(runMock).toHaveBeenCalledTimes(2);
        finishRun[1]();
        await flush();
    });

    it('shows a failed run as an error and still runs the queue', async () => {
        queueEvaluations(PROJECT, ['a']);
        queueEvaluations(PROJECT, ['b']);

        finishRun[0](new Error('The evaluations did not run: boom'));
        await flush();
        expect(window.showErrorMessage).toHaveBeenCalledWith('The evaluations did not run: boom');
        expect(runMock).toHaveBeenLastCalledWith(PROJECT, ['b'], expect.anything());

        finishRun[1]();
        await flush();
    });
});
