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

import { CancellationTokenSource, window } from 'vscode';
import { EvaluationRunState } from '@wso2/ballerina-core';
import { notifyEvaluationRunStateChanged } from '../../RPCLayer';
import { runEvaluations } from './runner';

interface ProjectQueue {
    running: string[];
    queued: string[];
    stopping: string[];
    cancellation?: CancellationTokenSource;
}

// Runs of one package never overlap: each `bal test` starts the package's listeners on the same ports.
const queues = new Map<string, ProjectQueue>();

export function getEvaluationRunState(projectPath: string): EvaluationRunState {
    const { running = [], queued = [], stopping = [] } = queues.get(projectPath) ?? {};
    return { projectPath, running, queued, stopping };
}

export function queueEvaluations(projectPath: string, functionNames: string[]): void {
    const queue = queues.get(projectPath) ?? { running: [], queued: [], stopping: [] };
    queues.set(projectPath, queue);
    const isPending = (name: string) => queue.running.includes(name) || queue.queued.includes(name);
    queue.queued.push(...functionNames.filter((name) => !isPending(name)));
    if (queue.cancellation) {
        notify(projectPath);
    } else {
        drain(projectPath, queue);
    }
}

// One `bal test` runs the whole batch, so stopping part of it re-queues the rest.
export function stopEvaluations(projectPath: string, functionNames?: string[]): void {
    const queue = queues.get(projectPath);
    if (!queue) {
        return;
    }
    const isStopped = (name: string) => !functionNames || functionNames.includes(name);
    queue.queued = queue.queued.filter((name) => !isStopped(name));
    const stopped = queue.running.filter(isStopped);
    if (stopped.length > 0) {
        queue.queued.unshift(...queue.running.filter((name) => !isStopped(name)));
        queue.stopping = stopped;
        queue.running = [];
        queue.cancellation?.cancel();
    }
    notify(projectPath);
}

async function drain(projectPath: string, queue: ProjectQueue): Promise<void> {
    while (queue.queued.length > 0) {
        queue.running = queue.queued;
        queue.queued = [];
        queue.cancellation = new CancellationTokenSource();
        notify(projectPath);
        try {
            await runEvaluations(projectPath, queue.running, queue.cancellation.token);
        } catch (error) {
            window.showErrorMessage(error instanceof Error ? error.message : String(error));
        } finally {
            queue.cancellation.dispose();
            queue.running = [];
            queue.stopping = [];
        }
    }
    queues.delete(projectPath);
    notify(projectPath);
}

function notify(projectPath: string): void {
    notifyEvaluationRunStateChanged(getEvaluationRunState(projectPath));
}
