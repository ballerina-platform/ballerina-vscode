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

// Whether the import wizard may continue after an unpinned `bal tool pull`, over every
// combination of pull result and language-server verdict.

import { decideMigrationToolPullOutcome, MigrationToolPullFacts } from '../utils/migration-tool-pull-outcome';

const PULL_RESULTS = [true, false];
const VERDICTS: Array<boolean | undefined> = [true, false, undefined];

const corpus: MigrationToolPullFacts[] = PULL_RESULTS.flatMap((pullSucceeded) =>
    VERDICTS.map((activeToolCompatible) => ({
        toolName: 'migrate-tibco',
        requiredVersion: '1.2.13',
        pullSucceeded,
        activeToolCompatible,
        pullError: pullSucceeded ? undefined : 'unexpected error occurred while pulling tool: connection refused',
    }))
);

const label = (f: MigrationToolPullFacts) =>
    `pull ${f.pullSucceeded ? 'succeeded' : 'failed'}, LS verdict ${String(f.activeToolCompatible)}`;

describe('decideMigrationToolPullOutcome', () => {
    it.each(corpus.map((f) => [label(f), f]))('the LS verdict decides when it is known (%s)', (_, facts) => {
        const outcome = decideMigrationToolPullOutcome(facts);
        if (facts.activeToolCompatible !== undefined) {
            expect(outcome.success).toBe(facts.activeToolCompatible);
        }
    });

    it.each(corpus.map((f) => [label(f), f]))('the pull result decides when the LS verdict is unknown (%s)', (_, facts) => {
        const outcome = decideMigrationToolPullOutcome(facts);
        if (facts.activeToolCompatible === undefined) {
            expect(outcome.success).toBe(facts.pullSucceeded);
        }
    });

    it.each(corpus.map((f) => [label(f), f]))('a blocked import names the tool and says why (%s)', (_, facts) => {
        const outcome = decideMigrationToolPullOutcome(facts);
        if (outcome.success) {
            return;
        }
        expect(outcome.message).toContain(facts.toolName);
        if (facts.activeToolCompatible === false) {
            expect(outcome.message).toContain(facts.requiredVersion);
        }
        if (!facts.pullSucceeded) {
            expect(outcome.message).toContain(facts.pullError);
        }
    });

    it('a failed pull does not block when a compatible tool is already active', () => {
        const outcome = decideMigrationToolPullOutcome({
            toolName: 'migrate-mule',
            requiredVersion: '1.2.11',
            pullSucceeded: false,
            activeToolCompatible: true,
            pullError: 'unexpected error occurred while pulling tool: connection refused',
        });
        expect(outcome.success).toBe(true);
        expect(outcome.message).toContain('1.2.11');
    });
});
