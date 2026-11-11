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

import {
    forwardWorkDoneProgress, isModulePullInProgress, MAX_MODULE_PULL_WAIT_MS, onModulePullProgress, startPullAwareTimeout, trackModulePullProgress
} from '../utils/module-pull-state';

const PULL = 'pull-module-19cef91b';

describe('module pull tracking', () => {
    afterEach(() => trackModulePullProgress(PULL, 'end'));

    it('is in progress between begin and end of a pull-module token', () => {
        expect(isModulePullInProgress()).toBe(false);
        trackModulePullProgress(PULL, 'begin');
        trackModulePullProgress(PULL, 'report');
        expect(isModulePullInProgress()).toBe(true);
        trackModulePullProgress(PULL, 'end');
        expect(isModulePullInProgress()).toBe(false);
    });

    it('notifies listeners of module-pull updates until they stop listening', () => {
        const kinds: string[] = [];
        const stop = onModulePullProgress(kind => kinds.push(kind));
        trackModulePullProgress(PULL, 'begin');
        trackModulePullProgress(PULL, 'report');
        stop();
        trackModulePullProgress(PULL, 'end');
        expect(kinds).toEqual(['begin', 'report']);
    });

    it('ignores progress that is not a module pull', () => {
        const kinds: string[] = [];
        const stop = onModulePullProgress(kind => kinds.push(kind));
        trackModulePullProgress('rename-1', 'begin');
        trackModulePullProgress(42, 'begin');
        stop();
        expect(kinds).toEqual([]);
        expect(isModulePullInProgress()).toBe(false);
    });
});

describe('forwardWorkDoneProgress', () => {
    it('passes every update on, even when a pull listener throws', () => {
        const stop = onModulePullProgress(() => { throw new Error('listener failed'); });
        const next = jest.fn();
        expect(() => forwardWorkDoneProgress(PULL, { kind: 'begin' as const }, next)).toThrow('listener failed');
        forwardWorkDoneProgress('rename-1', { kind: 'begin' as const }, next);
        stop();
        trackModulePullProgress(PULL, 'end');
        expect(next).toHaveBeenCalledTimes(2);
    });
});

describe('startPullAwareTimeout', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => {
        trackModulePullProgress(PULL, 'end');
        jest.useRealTimers();
    });

    it('fires after the delay when no pull is running', () => {
        const onTimeout = jest.fn();
        startPullAwareTimeout(onTimeout, 10000);
        jest.advanceTimersByTime(9999);
        expect(onTimeout).not.toHaveBeenCalled();
        jest.advanceTimersByTime(1);
        expect(onTimeout).toHaveBeenCalledTimes(1);
    });

    // The repro from wso2/product-integrator#2731: a 47 s pull starts right after the edit.
    // The rule: once a pull ends, the wait always has the full delay left, wherever the end falls
    // against the countdown. 9 900 ms and 49 900 ms end just before a check; 47 000 ms is the
    // pull from wso2/product-integrator#2731.
    it.each([500, 9900, 10000, 25000, 47000, 49900])(
        'gives the full delay after a pull that ends at %i ms',
        (pullEndsAt) => {
            const onTimeout = jest.fn();
            startPullAwareTimeout(onTimeout, 10000);
            trackModulePullProgress(PULL, 'begin');
            jest.advanceTimersByTime(pullEndsAt);
            trackModulePullProgress(PULL, 'end');
            jest.advanceTimersByTime(9999);
            expect(onTimeout).not.toHaveBeenCalled();
            jest.advanceTimersByTime(1);
            expect(onTimeout).toHaveBeenCalledTimes(1);
        }
    );

    it('gives up on a pull whose end never arrives', () => {
        const onTimeout = jest.fn();
        startPullAwareTimeout(onTimeout, 10000);
        trackModulePullProgress(PULL, 'begin');
        jest.advanceTimersByTime(MAX_MODULE_PULL_WAIT_MS + 10000);
        expect(onTimeout).toHaveBeenCalledTimes(1);
    });

    it('gives the full delay to a pull that ends just before the cap, so the wait ends by the cap plus one delay', () => {
        const onTimeout = jest.fn();
        startPullAwareTimeout(onTimeout, 10000);
        trackModulePullProgress(PULL, 'begin');
        jest.advanceTimersByTime(MAX_MODULE_PULL_WAIT_MS - 100);
        trackModulePullProgress(PULL, 'end');
        jest.advanceTimersByTime(9999);
        expect(onTimeout).not.toHaveBeenCalled();
        jest.advanceTimersByTime(1);
        expect(onTimeout).toHaveBeenCalledTimes(1);
        // MAX_MODULE_PULL_WAIT_MS - 100 + 10000 ms from the start: within the cap plus one delay.
    });

    it('forgets a pull whose end never arrives, so later waits time out normally', () => {
        trackModulePullProgress(PULL, 'begin');
        startPullAwareTimeout(jest.fn(), 10000);
        jest.advanceTimersByTime(MAX_MODULE_PULL_WAIT_MS + 10000);
        expect(isModulePullInProgress()).toBe(false);

        const onTimeout = jest.fn();
        startPullAwareTimeout(onTimeout, 10000);
        jest.advanceTimersByTime(10000);
        expect(onTimeout).toHaveBeenCalledTimes(1);
    });

    it('never fires after cancel, even when a pull ends later', () => {
        const onTimeout = jest.fn();
        startPullAwareTimeout(onTimeout, 10000).cancel();
        trackModulePullProgress(PULL, 'begin');
        trackModulePullProgress(PULL, 'end');
        jest.advanceTimersByTime(60000);
        expect(onTimeout).not.toHaveBeenCalled();
    });
});
