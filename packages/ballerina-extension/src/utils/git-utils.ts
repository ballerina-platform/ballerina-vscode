'use strict';
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

import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface GitState {
    commitSha: string | null;
    isDirty: boolean;
    branch: string | null;
}

function run(command: string, cwd: string): Promise<string> {
    return new Promise((resolve, reject) => {
        exec(command, { cwd, maxBuffer: 10 * 1024 * 1024 }, (error, stdout) => {
            if (error) {
                reject(error);
            } else {
                resolve(stdout.trim());
            }
        });
    });
}

const DIFF_EXCLUDES = "-- . ':!tests/evaluation-reports' ':!target'";


export async function isGitRepo(cwd: string): Promise<boolean> {
    try {
        const result = await run('git rev-parse --is-inside-work-tree', cwd);
        return result === 'true';
    } catch {
        return false;
    }
}

export async function captureGitState(cwd: string): Promise<GitState> {
    if (!(await isGitRepo(cwd))) {
        return { commitSha: null, isDirty: false, branch: null };
    }

    let commitSha: string | null = null;
    let isDirty = false;
    let branch: string | null = null;

    try {
        commitSha = await run('git rev-parse HEAD', cwd);
    } catch { /* no commits yet */ }

    try {
        const status = await run('git status --porcelain', cwd);
        isDirty = status.length > 0;
    } catch { /* ignore */ }

    try {
        branch = await run('git rev-parse --abbrev-ref HEAD', cwd);
    } catch { /* ignore */ }

    return { commitSha, isDirty, branch };
}

export async function createSnapshot(cwd: string): Promise<string | null> {
    try {
        const sha = await run('git stash create', cwd);
        return sha || null;
    } catch {
        return null;
    }
}

export async function pinSnapshot(cwd: string, sha: string): Promise<void> {
    try {
        assertSha(sha);
        await run(`git update-ref refs/eval-snapshots/${sha} ${sha}`, cwd);
    } catch { /* non-fatal: snapshot works short-term without pin */ }
}

export async function getDiffStat(cwd: string, from: string, to: string): Promise<string> {
    try {
        assertSha(from);
        if (to !== "HEAD") assertSha(to);
        // When comparing to "HEAD", diff against working tree instead so uncommitted changes are included
        const toArg = to === "HEAD" ? "" : ` ${to}`;
        return await run(`git diff --stat ${from}${toArg} ${DIFF_EXCLUDES}`, cwd);
    } catch {
        return '';
    }
}

export async function getDiffFull(cwd: string, from: string, to: string): Promise<string> {
    try {
        assertSha(from);
        if (to !== "HEAD") assertSha(to);
        const toArg = to === "HEAD" ? "" : ` ${to}`;
        return await run(`git diff ${from}${toArg} ${DIFF_EXCLUDES}`, cwd);
    } catch {
        return '';
    }
}

export async function objectExists(cwd: string, sha: string): Promise<boolean> {
    try {
        assertSha(sha);
        await run(`git cat-file -t ${sha}`, cwd);
        return true;
    } catch {
        return false;
    }
}

export async function restoreToCheckpoint(
    cwd: string,
    sha: string,
    isDirty: boolean
): Promise<{ safetyStashSha?: string }> {
    assertSha(sha);

    // Safety stash current changes (including untracked files)
    let safetyStashSha: string | undefined;
    const currentStatus = await run('git status --porcelain', cwd);
    if (currentStatus.length > 0) {
        await run('git stash push --include-untracked -m "Auto-saved before eval checkpoint restore"', cwd);
        const stashSha = await run('git rev-parse stash@{0}', cwd);
        if (stashSha) {
            safetyStashSha = stashSha;
        }
    }

    // Clean working tree
    await run('git checkout -- .', cwd);
    await run('git clean -fd --exclude=tests/evaluation-reports --exclude=target', cwd);

    // Apply the checkpoint
    if (isDirty) {
        await run(`git stash apply ${sha}`, cwd);
    } else {
        await run(`git checkout ${sha} -- .`, cwd);
    }

    return { safetyStashSha };
}

function assertSha(sha: string): void {
    if (!/^[a-f0-9]{4,64}$/i.test(sha)) {
        throw new Error(`Invalid git SHA: ${sha}`);
    }
}

export async function ensureEvalReportsGitignored(projectPath: string): Promise<void> {
    try {
        const gitignorePath = path.join(projectPath, '.gitignore');
        const pattern = 'tests/evaluation-reports/';

        if (!fs.existsSync(gitignorePath)) {
            return;
        }

        const content = fs.readFileSync(gitignorePath, 'utf-8');
        if (content.includes(pattern)) {
            return;
        }

        const suffix = content.endsWith('\n') ? '' : '\n';
        fs.appendFileSync(gitignorePath, `${suffix}${pattern}\n`);
    } catch { /* fail silently */ }
}
