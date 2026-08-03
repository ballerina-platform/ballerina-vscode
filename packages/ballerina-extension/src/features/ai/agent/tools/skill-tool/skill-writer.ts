// Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com/) All Rights Reserved.

// WSO2 LLC. licenses this file to you under the Apache License,
// Version 2.0 (the "License"); you may not use this file except
// in compliance with the License.
// You may obtain a copy of the License at

// http://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied. See the License for the
// specific language governing permissions and limitations
// under the License.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

export interface SkillsConfig {
    disabledSkills: string[];
    enabledSkills: string[];
}

export function getSkillsConfig(projectRootPath: string | null): SkillsConfig {
    const cfg = projectRootPath
        ? vscode.workspace.getConfiguration('ballerina.copilot', vscode.Uri.file(projectRootPath))
        : vscode.workspace.getConfiguration('ballerina.copilot');
    const di = cfg.inspect<any>('skills');
    const globalSkills = di?.globalValue ?? { disabled: [], enabled: [] };
    const wsSkills     = di?.workspaceFolderValue ?? di?.workspaceValue ?? null;

    if (!wsSkills) {
        return {
            disabledSkills: [...(globalSkills.disabled ?? [])],
            enabledSkills:  [...(globalSkills.enabled  ?? [])],
        };
    }

    // Workspace overrides global on a per-skill basis (not a plain union merge).
    // workspace.disabled adds to the disabled set; workspace.enabled removes from it.
    const disabled = new Set<string>(globalSkills.disabled ?? []);
    const enabled  = new Set<string>(globalSkills.enabled  ?? []);
    for (const k of wsSkills.disabled ?? []) { disabled.add(k);    enabled.delete(k); }
    for (const k of wsSkills.enabled  ?? []) { enabled.add(k);     disabled.delete(k); }
    return {
        disabledSkills: [...disabled],
        enabledSkills:  [...enabled],
    };
}

export async function setSkillEnabled(
    skillId: string,
    enabled: boolean,
    isDefaultFalse = false,
    scope: 'user' | 'workspace' = 'user'
): Promise<void> {
    const target = scope === 'workspace'
        ? vscode.ConfigurationTarget.Workspace
        : vscode.ConfigurationTarget.Global;

    const cfg = vscode.workspace.getConfiguration('ballerina.copilot');
    const di  = cfg.inspect<any>('skills');
    const scopedSkills = scope === 'workspace'
        ? { ...(di?.workspaceFolderValue ?? di?.workspaceValue ?? {}) }
        : { ...(di?.globalValue ?? {}) };
    const disabledList = [...(scopedSkills.disabled ?? [])];
    const enabledList  = [...(scopedSkills.enabled  ?? [])];

    if (isDefaultFalse) {
        if (enabled) {
            if (!enabledList.includes(skillId)) { enabledList.push(skillId); }
            const i = disabledList.indexOf(skillId);
            if (i !== -1) { disabledList.splice(i, 1); }
        } else {
            const i = enabledList.indexOf(skillId);
            if (i !== -1) { enabledList.splice(i, 1); }
        }
    } else {
        if (enabled) {
            const i = disabledList.indexOf(skillId);
            if (i !== -1) { disabledList.splice(i, 1); }
            if (!enabledList.includes(skillId)) { enabledList.push(skillId); }
        } else {
            if (!disabledList.includes(skillId)) { disabledList.push(skillId); }
            const ei = enabledList.indexOf(skillId);
            if (ei !== -1) { enabledList.splice(ei, 1); }
        }
    }

    await cfg.update('skills', { disabled: disabledList, enabled: enabledList }, target);

    // When writing a workspace-scope change, remove any stale global entry for
    // this skill so global doesn't silently conflict with workspace state.
    if (scope === 'workspace') {
        const globalVal = di?.globalValue;
        if (globalVal) {
            const globalDisabled = (globalVal.disabled ?? []).filter((k: string) => k !== skillId);
            const globalEnabled  = (globalVal.enabled  ?? []).filter((k: string) => k !== skillId);
            const changed = globalDisabled.length !== (globalVal.disabled ?? []).length
                         || globalEnabled.length  !== (globalVal.enabled  ?? []).length;
            if (changed) {
                try {
                    await cfg.update('skills', { disabled: globalDisabled, enabled: globalEnabled }, vscode.ConfigurationTarget.Global);
                } catch { /* best-effort */ }
            }
        }
    }

    // When writing a user-scope (global) change, remove any stale workspace entry for
    // this skill so workspace doesn't silently override the global state.
    if (scope === 'user') {
        const wsVal = di?.workspaceFolderValue ?? di?.workspaceValue;
        if (wsVal) {
            const wsDisabled = (wsVal.disabled ?? []).filter((k: string) => k !== skillId);
            const wsEnabled  = (wsVal.enabled  ?? []).filter((k: string) => k !== skillId);
            const changed = wsDisabled.length !== (wsVal.disabled ?? []).length
                         || wsEnabled.length  !== (wsVal.enabled  ?? []).length;
            if (changed) {
                const wsTarget = di?.workspaceFolderValue !== undefined
                    ? vscode.ConfigurationTarget.WorkspaceFolder
                    : vscode.ConfigurationTarget.Workspace;
                try {
                    await cfg.update('skills', { disabled: wsDisabled, enabled: wsEnabled }, wsTarget);
                } catch { /* best-effort */ }
            }
        }
    }
}

function validatePathSegment(segment: string, label: string): void {
    if (!segment || /[/\\]/.test(segment) || segment === '..' || segment === '.') {
        throw new Error(`Invalid ${label}: "${segment}"`);
    }
}

function assertWithinRoot(resolvedTarget: string, root: string): void {
    const rel = path.relative(root, resolvedTarget);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
        throw new Error(`Path escapes allowed directory: "${resolvedTarget}"`);
    }
}

function buildSkillMd(name: string, trigger: string, body?: string): string {
    const frontmatter = `---\nname: ${name}\ndescription: ${trigger}\n---`;
    return body && body.trim() ? `${frontmatter}\n\n${body.trim()}\n` : `${frontmatter}\n`;
}

export function writeUserSkill(name: string, trigger: string, body?: string): void {
    validatePathSegment(name, 'skill name');
    const skillDir = path.join(os.homedir(), '.ballerina', 'copilot', 'skills', name);
    assertWithinRoot(path.resolve(skillDir), path.resolve(path.join(os.homedir(), '.ballerina', 'copilot', 'skills')));
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), buildSkillMd(name, trigger, body), 'utf-8');
}

export function writeProjectSkill(
    projectRoot: string,
    name: string,
    trigger: string,
    body?: string
): void {
    validatePathSegment(name, 'skill name');
    const resolvedRoot = path.resolve(projectRoot);
    const baseDir = path.join(projectRoot, '.agents', 'skills', name);
    assertWithinRoot(path.resolve(baseDir), resolvedRoot);
    fs.mkdirSync(baseDir, { recursive: true });
    fs.writeFileSync(path.join(baseDir, 'SKILL.md'), buildSkillMd(name, trigger, body), 'utf-8');
}

export function deleteUserSkill(name: string): void {
    validatePathSegment(name, 'skill name');
    const skillDir = path.join(os.homedir(), '.ballerina', 'copilot', 'skills', name);
    assertWithinRoot(path.resolve(skillDir), path.resolve(path.join(os.homedir(), '.ballerina', 'copilot', 'skills')));
    if (fs.existsSync(skillDir)) {
        fs.rmSync(skillDir, { recursive: true, force: true });
    }
}

export function deleteProjectSkill(projectRoot: string, name: string): void {
    validatePathSegment(name, 'skill name');
    const resolvedRoot = path.resolve(projectRoot);
    const skillDir = path.join(projectRoot, '.agents', 'skills', name);
    assertWithinRoot(path.resolve(skillDir), resolvedRoot);
    if (fs.existsSync(skillDir)) {
        fs.rmSync(skillDir, { recursive: true, force: true });
    }
}
