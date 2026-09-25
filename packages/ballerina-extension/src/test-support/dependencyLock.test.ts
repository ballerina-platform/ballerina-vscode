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

// What the Java 25 dependency check decides on. Real directories, not an fs mock.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    REQUIRED_BALLERINA_VERSION,
    assessDependencyLock,
    assessDependencyLockText,
    findManifestDistribution,
    findOutdatedPackages,
    findPackageRoot,
    findPinnedDependencies,
    getRollbackDistribution,
    getWorkspacePackagePaths,
    isBeforeRequiredDistribution,
    isRuntimeOnRequiredDistribution,
    pickRollbackDistribution,
} from '../features/project/dependency-lock';

/** A Dependencies.toml as `bal build` writes it, with the given `[ballerina]` table body. */
function lockText(ballerinaTable: string): string {
    return `# AUTO-GENERATED FILE. DO NOT MODIFY.\n\n[ballerina]\n${ballerinaTable}\n\n`
        + '[[package]]\norg = "ballerina"\nname = "log"\nversion = "2.13.0"\n';
}

const BEFORE = ['2201.0.0', '2201.8.6', '2201.12.3', '2201.13.0-alpha', '2201.13.6', '2200.99.99'];
const AT_OR_AFTER = ['2201.14.0', '2201.14.0-alpha', '2201.14.0-20260916-095600-2ad98357', '2201.14.2', '2201.15.0', '2202.0.0'];

/** A package folder with a generated integration manifest and, optionally, a lock from `lockedBy`. */
function makePackage(dir: string, lockedBy?: string): string {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'Ballerina.toml'),
        `[package]\norg = "wso2"\nname = "${path.basename(dir)}"\nversion = "0.1.0"\ndistribution = "2201.13.6"\n\n`
        + '[build-options]\nsticky = true\n');
    if (lockedBy) {
        fs.writeFileSync(path.join(dir, 'Dependencies.toml'), lockText(`distribution-version = "${lockedBy}"`));
    }
    return dir;
}

/** A workspace root, as the Integrator creates it, listing `members`. */
function makeWorkspace(members: string[]): void {
    fs.writeFileSync(path.join(root, 'Ballerina.toml'),
        `[workspace]\ntitle = "Default"\npackages = [${members.map((member) => `"${member}"`).join(', ')}]\n`);
}

let root: string;

beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'dep-lock-'));
});

afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
});

describe('distribution versions', () => {
    it('keys off 2201.14.0, the first Java 25 distribution', () => {
        expect(REQUIRED_BALLERINA_VERSION).toBe('2201.14.0');
    });

    it.each(BEFORE)('%s is before the required distribution', (version) => {
        expect(isBeforeRequiredDistribution(version)).toBe(true);
        expect(isRuntimeOnRequiredDistribution(version)).toBe(false);
    });

    it.each(AT_OR_AFTER)('%s is not before the required distribution, pre-releases included', (version) => {
        expect(isBeforeRequiredDistribution(version)).toBe(false);
        expect(isRuntimeOnRequiredDistribution(version)).toBe(true);
    });

    it('reads the runtime version out of `bal version` style strings', () => {
        expect(isRuntimeOnRequiredDistribution('Ballerina 2201.14.0 (Swan Lake Update 14)')).toBe(true);
        expect(isRuntimeOnRequiredDistribution('Ballerina 2201.13.6 (Swan Lake Update 13)')).toBe(false);
    });

    it('fails open on versions it cannot read', () => {
        for (const version of [undefined, '', 'swan-lake', '2201.x']) {
            expect(isBeforeRequiredDistribution(version)).toBe(false);
            expect(isRuntimeOnRequiredDistribution(version)).toBe(false); // no check on an unknown runtime
        }
    });
});

describe('lock assessment', () => {
    it.each(BEFORE)('a lock resolved by %s is outdated and reports its version', (version) => {
        expect(assessDependencyLockText(lockText(`dependencies-toml-version = "2"\ndistribution-version = "${version}"`)))
            .toEqual({ kind: 'outdated', lockedVersion: version });
    });

    it.each(AT_OR_AFTER)('a lock resolved by %s is current', (version) => {
        expect(assessDependencyLockText(lockText(`dependencies-toml-version = "2"\ndistribution-version = "${version}"`)))
            .toEqual({ kind: 'current', lockedVersion: version });
    });

    it('treats a v1 lock without distribution-version as outdated', () => {
        expect(assessDependencyLockText(lockText('dependencies-toml-version = "1"'))).toEqual({ kind: 'outdated' });
    });

    it('does not guess on a lock it cannot read', () => {
        expect(assessDependencyLockText('[ballerina\nnot toml')).toEqual({ kind: 'unknown' });
        expect(assessDependencyLockText(lockText('distribution-version = "latest"'))).toEqual({ kind: 'unknown' });
        expect(assessDependencyLockText(lockText('distribution-version = 2201'))).toEqual({ kind: 'unknown' });
    });

    it('has nothing to update without a Dependencies.toml', () => {
        expect(assessDependencyLock(root)).toEqual({ kind: 'no-lock' });
    });

    it('reads the project\'s Dependencies.toml from disk', () => {
        fs.writeFileSync(path.join(root, 'Dependencies.toml'), lockText('distribution-version = "2201.12.3"'));
        expect(assessDependencyLock(root)).toEqual({ kind: 'outdated', lockedVersion: '2201.12.3' });
    });
});

describe('Ballerina.toml distribution', () => {
    const manifests: Record<string, string> = {
        generated: '\n[package]\norg = "wso2"\nname = "orders"\nversion = "0.1.0"\ndistribution = "2201.12.3"\ntitle = "Orders"\n\n[build-options]\nsticky = true\n\n',
        spaced: '[package]\n  org = "wso2"\n  distribution   =   "2201.12.3"   # pinned\n',
        crlf: '[package]\r\norg = "wso2"\r\ndistribution = "2201.12.3"\r\n\r\n[build-options]\r\nsticky = true\r\n',
        commentedHeader: '[package] # the package\ndistribution = "2201.12.3"\n',
    };

    it.each(Object.keys(manifests))('replacing the located value only changes the version (%s)', (name) => {
        const text = manifests[name];
        const field = findManifestDistribution(text);
        expect(field?.value).toBe('2201.12.3');
        const updated = text.slice(0, field.start) + '2201.14.0' + text.slice(field.end);
        expect(updated).toBe(text.replace('"2201.12.3"', '"2201.14.0"'));
    });

    it('ignores a distribution key outside the [package] table', () => {
        expect(findManifestDistribution('[package]\norg = "wso2"\n\n[build-options]\ndistribution = "2201.12.3"\n'))
            .toBeUndefined();
        expect(findManifestDistribution('[tool.openapi]\ndistribution = "2201.12.3"\n')).toBeUndefined();
    });

    it('finds nothing when the field was removed', () => {
        expect(findManifestDistribution('[package]\norg = "wso2"\nname = "orders"\n')).toBeUndefined();
    });
});

describe('rollback distribution', () => {
    it('goes back to the distribution the lock was resolved on', () => {
        expect(getRollbackDistribution('2201.12.3', '2201.12.0')).toBe('2201.12.3');
    });

    it('pulls the GA of a pre-release', () => {
        expect(getRollbackDistribution('2201.13.0-alpha')).toBe('2201.13.0');
    });

    it('falls back to Ballerina.toml when the lock has no version', () => {
        expect(getRollbackDistribution(undefined, '2201.12.0')).toBe('2201.12.0');
    });

    it('never suggests a distribution that is itself on Java 25', () => {
        expect(getRollbackDistribution(undefined, '2201.14.0')).toBeUndefined();
        expect(getRollbackDistribution(undefined, undefined)).toBeUndefined();
    });
});

describe('pinned dependencies', () => {
    it('lists every complete [[dependency]] pin', () => {
        const text = '[package]\norg = "wso2"\n\n[[dependency]]\norg = "ballerinax"\nname = "kafka"\nversion = "4.2.0"\n\n'
            + '[[dependency]]\norg = "ballerina"\nname = "http"\n\n'
            + '[[dependency]]\n  org = "ballerinax"\n  name = "redis"\n  version = "3.1.0"\n';
        expect(findPinnedDependencies(text)).toEqual(['ballerinax/kafka:4.2.0', 'ballerinax/redis:3.1.0']);
    });

    it('finds none in a generated integration manifest', () => {
        expect(findPinnedDependencies('[package]\norg = "wso2"\n\n[build-options]\nsticky = true\n')).toEqual([]);
    });
});

describe('workspaces', () => {
    it('lists the members of a workspace root and nothing for a package', () => {
        makeWorkspace(['orders', 'apps/billing']);
        expect(getWorkspacePackagePaths(root)).toEqual([path.join(root, 'orders'), path.join(root, 'apps', 'billing')]);
        expect(getWorkspacePackagePaths(makePackage(path.join(root, 'orders')))).toBeUndefined();
    });

    it('checks every member, since the root has no lock of its own', () => {
        makeWorkspace(['teststicky', 'untitled', 'legacy', 'apps/billing']);
        makePackage(path.join(root, 'teststicky'), '2201.14.0-20260917-124200-7f273e6a');
        makePackage(path.join(root, 'untitled'));
        makePackage(path.join(root, 'legacy'), '2201.12.3');
        makePackage(path.join(root, 'apps', 'billing'), '2201.13.6');
        expect(findOutdatedPackages(root)).toEqual([
            { path: path.join(root, 'legacy'), name: 'legacy', lockedVersion: '2201.12.3' },
            { path: path.join(root, 'apps', 'billing'), name: path.join('apps', 'billing'), lockedVersion: '2201.13.6' },
        ]);
    });

    it('has nothing to update when every member is current or unlocked', () => {
        makeWorkspace(['teststicky', 'untitled']);
        makePackage(path.join(root, 'teststicky'), '2201.14.0');
        makePackage(path.join(root, 'untitled'));
        expect(findOutdatedPackages(root)).toEqual([]);
    });

    it('checks a lone package by itself', () => {
        const pkg = makePackage(path.join(root, 'orders'), '2201.12.3');
        expect(findOutdatedPackages(pkg)).toEqual([{ path: pkg, name: 'orders', lockedVersion: '2201.12.3' }]);
    });

    it('goes back to the newest distribution any outdated member was locked with', () => {
        expect(pickRollbackDistribution([
            { lockedVersion: '2201.12.3' },
            { lockedVersion: '2201.13.6' },
            { manifestDistribution: '2201.13.0' },
        ])).toBe('2201.13.6');
        expect(pickRollbackDistribution([{}, { manifestDistribution: '2201.14.0' }])).toBeUndefined();
    });
});

describe('package root', () => {
    it('walks up from a file or directory to the nearest Ballerina.toml', () => {
        const pkg = path.join(root, 'orders');
        fs.mkdirSync(path.join(pkg, 'modules', 'db'), { recursive: true });
        fs.writeFileSync(path.join(pkg, 'Ballerina.toml'), '[package]\n');
        fs.writeFileSync(path.join(pkg, 'modules', 'db', 'db.bal'), '');
        expect(findPackageRoot(path.join(pkg, 'modules', 'db', 'db.bal'))).toBe(pkg);
        expect(findPackageRoot(pkg)).toBe(pkg);
    });

    it('is undefined outside a package', () => {
        expect(findPackageRoot(root)).toBeUndefined();
    });
});
