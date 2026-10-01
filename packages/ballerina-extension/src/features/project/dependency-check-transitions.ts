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

// The visualizer state machine's dependency-check routing, kept apart from stateMachine.ts so it can be unit tested.

import { TransitionConfig } from 'xstate';
import { normalizeProjectPath } from '@wso2/ballerina-core';

export type DependencyCheckResult = 'compatible' | 'blocked';

export interface DependencyCheckContext {
    workspacePath?: string;
    projectPath?: string;
    dependenciesResolved?: boolean;
    connectorUpgradesCheckedPaths?: Set<string>;
}

/** The root the visualizer checks: its workspace when there is one, so the overview and every member are covered. */
export function getVisualizerCheckRoot(context: DependencyCheckContext): string | undefined {
    return normalizeProjectPath(context.workspacePath || context.projectPath) || undefined;
}

/** Whether entering a view should run the check: on every navigation with a root, so a lock changed since is seen. */
export function needsDependencyCheck(context: DependencyCheckContext): boolean {
    return !!getVisualizerCheckRoot(context);
}

/**
 * The check's `onDone` routing, in order. A blocked root skips both the startup build (a sticky `bal build` of an
 * outdated lock pulls the very versions that fail on Java 25) and the connector upgrade prompt, and is checked
 * again on the next navigation. Updates start from the blocked screen, which re-enters the view once done.
 */
export function createDependencyCheckTransitions<TContext extends DependencyCheckContext>():
    Array<TransitionConfig<TContext, any>> {
    const connectorsUnchecked = (context: TContext) => !context.connectorUpgradesCheckedPaths?.has(context.projectPath);

    return [
        {
            target: 'webViewLoading',
            cond: (context, event) => event.data === 'blocked'
        },
        {
            target: 'resolveMissingDependencies',
            cond: (context) => !context.dependenciesResolved
        },
        {
            target: 'checkConnectorUpgrades',
            cond: connectorsUnchecked
        },
        {
            target: 'webViewLoading'
        }
    ];
}
