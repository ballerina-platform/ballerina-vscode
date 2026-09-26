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

// Where the visualizer goes after the dependency check, driven through a real xstate machine
// built from the same transitions stateMachine.ts uses.

// The core barrel reaches an ESM-only dependency; the transitions only need its real path helpers.
jest.mock('@wso2/ballerina-core', () => jest.requireActual('@wso2/ballerina-core/lib/utils/path-utils'));

import { createMachine, interpret } from 'xstate';
import {
    DependencyCheckContext,
    DependencyCheckResult,
    createDependencyCheckTransitions,
    getVisualizerCheckRoot,
    needsDependencyCheck,
} from '../features/project/dependency-check-transitions';

const PROJECT = '/work/orders';

/** Runs the check state to its next state with `result`, starting from `context`. */
function route(result: DependencyCheckResult, context: DependencyCheckContext): Promise<{
    target: string;
    context: DependencyCheckContext;
}> {
    const machine = createMachine<DependencyCheckContext>({
        id: 'dependencyCheck',
        initial: 'checkDependencyCompatibility',
        predictableActionArguments: true,
        context,
        states: {
            checkDependencyCompatibility: {
                invoke: {
                    src: () => Promise.resolve(result),
                    onDone: createDependencyCheckTransitions<DependencyCheckContext>()
                }
            },
            resolveMissingDependencies: {},
            checkConnectorUpgrades: {},
            webViewLoading: {}
        }
    });
    return new Promise((resolve) => {
        const service = interpret(machine).onTransition((state) => {
            if (!state.matches('checkDependencyCompatibility')) {
                resolve({ target: String(state.value), context: state.context });
                service.stop();
            }
        });
        service.start();
    });
}

function contextWith(overrides: Partial<DependencyCheckContext>): DependencyCheckContext {
    return {
        projectPath: PROJECT,
        dependenciesResolved: false,
        connectorUpgradesCheckedPaths: new Set(),
        dependencyCompatibleRoots: new Set(),
        ...overrides
    };
}

describe('routing after the dependency check', () => {
    const cases: {
        name: string;
        result: DependencyCheckResult;
        context: Partial<DependencyCheckContext>;
        target: string;
        markedCompatible: boolean;
        dependenciesResolved: boolean;
    }[] = [
        {
            name: 'blocked skips the startup build and the connector prompt, and is checked again next time',
            result: 'blocked', context: {},
            target: 'webViewLoading', markedCompatible: false, dependenciesResolved: false
        },
        {
            name: 'updated skips the startup build but still offers connector upgrades',
            result: 'updated', context: {},
            target: 'checkConnectorUpgrades', markedCompatible: true, dependenciesResolved: true
        },
        {
            name: 'updated with connectors already checked goes straight to the view',
            result: 'updated', context: { connectorUpgradesCheckedPaths: new Set([PROJECT]) },
            target: 'webViewLoading', markedCompatible: true, dependenciesResolved: true
        },
        {
            name: 'compatible runs the startup build when dependencies are unresolved',
            result: 'compatible', context: {},
            target: 'resolveMissingDependencies', markedCompatible: true, dependenciesResolved: false
        },
        {
            name: 'compatible with dependencies resolved goes to the connector prompt',
            result: 'compatible', context: { dependenciesResolved: true },
            target: 'checkConnectorUpgrades', markedCompatible: true, dependenciesResolved: true
        },
        {
            name: 'compatible with everything done goes straight to the view',
            result: 'compatible',
            context: { dependenciesResolved: true, connectorUpgradesCheckedPaths: new Set([PROJECT]) },
            target: 'webViewLoading', markedCompatible: true, dependenciesResolved: true
        },
    ];

    it.each(cases)('$name', async ({ result, context, target, markedCompatible, dependenciesResolved }) => {
        const next = await route(result, contextWith(context));
        expect(next.target).toBe(target);
        expect(next.context.dependencyCompatibleRoots.has(PROJECT)).toBe(markedCompatible);
        expect(next.context.dependenciesResolved).toBe(dependenciesResolved);
    });

    it('marks the workspace, not the member, so every member is covered', async () => {
        const next = await route('compatible', contextWith({ workspacePath: '/work' }));
        expect([...next.context.dependencyCompatibleRoots]).toEqual(['/work']);
    });
});

describe('check root', () => {
    it('is the workspace when there is one, else the package', () => {
        expect(getVisualizerCheckRoot({ workspacePath: '/work', projectPath: PROJECT })).toBe('/work');
        expect(getVisualizerCheckRoot({ projectPath: PROJECT })).toBe(PROJECT);
        expect(getVisualizerCheckRoot({})).toBeUndefined();
    });

    it('treats one root reached by different spellings as the same key', () => {
        expect(getVisualizerCheckRoot({ projectPath: 'C:\\work\\orders\\' })).toBe('c:\\work\\orders');
        expect(needsDependencyCheck({
            projectPath: `${PROJECT}/`,
            dependencyCompatibleRoots: new Set([PROJECT])
        })).toBe(false);
    });

    it('runs for an unchecked root and never without one', () => {
        expect(needsDependencyCheck({ projectPath: PROJECT, dependencyCompatibleRoots: new Set() })).toBe(true);
        expect(needsDependencyCheck({ dependencyCompatibleRoots: new Set() })).toBe(false);
    });
});
