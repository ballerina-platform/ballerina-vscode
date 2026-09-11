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

import { tool } from 'ai';
import { z } from 'zod';
import { CopilotEventHandler } from '../../../utils/events';
import { Skill } from '../../skills/types';
import { readProjectSkillContent, readUserSkillContent } from './skill-reader';
import { buildAllDisabledSet } from '../../skills/context';
import { approvalManager } from '../../../state/ApprovalManager';
import { SkillEnableStage } from '@wso2/ballerina-core';

export const SKILL_TOOL_NAME = "invoke_skill";

function applySkillArguments(content: string, args: string): string {
    const parts = args.split(/\s+/);
    return content
        .replace(/\$ARGUMENTS\[(\d+)\]/g, (_, i) => parts[+i] ?? '')
        .replace(/\$(\d+)/g, (_, i) => parts[+i] ?? '')
        .replace(/\$ARGUMENTS/g, args);
}

export function createSkillTool(
    builtInSkills: Skill[],
    projectRootPath: string,
    eventHandler: CopilotEventHandler,
) {
    return tool({
        description:
            `Fetches the full rule set for a named skill and returns it ready to apply.

Call this tool once per skill whenever a skill's trigger condition is met. Each call loads exactly one skill.
- Built-in skills: plain name (e.g. "data-map").
- Project skills: "<projectName>/<skillName>".
- User skills: "user/<skillName>".`,
        inputSchema: z.object({
            skillName: z.string().describe(
                "Name of the skill to invoke. Case-insensitive. " +
                "Plain name for built-in skills and full prefixed name for project or user skills."
            ),
            args: z.string().optional().describe(
                "Arguments to substitute for $ARGUMENTS, $ARGUMENTS[N], and $N placeholders in the skill content."
            ),
        }),
        execute: async ({ skillName, args }, context?: { toolCallId?: string }) => {
            const toolCallId = context?.toolCallId ?? `skill-${Date.now()}`;
            console.debug(`[SkillTool] Invoking skill: "${skillName}"${args ? ` with args: "${args}"` : ''}`);
            eventHandler({
                type: "tool_call",
                toolName: SKILL_TOOL_NAME,
                toolInput: { skillName },
                toolCallId,
            } as any);

            // Check disabled config before executing
            const allDisabled = buildAllDisabledSet(projectRootPath || null);

            const lower = skillName.toLowerCase();
            const builtIn = builtInSkills.find(s => s.name.toLowerCase() === lower);
            const projectSkill = projectRootPath ? readProjectSkillContent(projectRootPath, skillName) : null;
            const userSkill = readUserSkillContent(skillName);

            const resolved = projectSkill ?? userSkill ?? builtIn;

            if (!resolved) {
                console.debug(`[SkillTool] Skill not found: "${skillName}"`);
                const result = {
                    found: false,
                    message: `No skill named '${skillName}' found.`,
                };
                eventHandler({ type: "tool_result", toolName: SKILL_TOOL_NAME, toolOutput: result, toolCallId } as any);
                return result;
            }

            const resolvedSource = projectSkill ? 'project' : userSkill ? 'user' : 'built-in';

            // Prefer the original invocation name (full prefixed, e.g. "user/foo") since that
            // is what the config stores. Fall back to resolved.name for built-ins where both match.
            const effectiveId = allDisabled.has(skillName.toLowerCase()) ? skillName.toLowerCase()
                              : allDisabled.has(resolved.name) ? resolved.name
                              : null;

            if (effectiveId !== null) {
                let enableResponse: { enabled: boolean };
                try {
                    enableResponse = await approvalManager.requestSkillEnable(
                        toolCallId, resolved.name, effectiveId, eventHandler
                    );
                } catch {
                    enableResponse = { enabled: false };
                }

                if (enableResponse.enabled) {
                    // Re-read skill content now that it has been enabled
                    const freshProject = projectRootPath ? readProjectSkillContent(projectRootPath, skillName) : null;
                    const freshUser = readUserSkillContent(skillName);
                    const fresh = freshProject ?? freshUser ?? builtIn;
                    const rawContent = fresh?.content ?? '';
                    const content = args ? applySkillArguments(rawContent, args) : rawContent;
                    const result = { found: true, skillName: fresh?.name ?? resolved.name, content };
                    eventHandler({ type: "tool_result", toolName: SKILL_TOOL_NAME, toolOutput: result, toolCallId } as any);
                    return result;
                } else {
                    // Self-emitted (not left to the "Continue without it" RPC handler) so an abort resolves it too.
                    eventHandler({
                        type: "skill_enable_event",
                        requestId: toolCallId,
                        stage: SkillEnableStage.SKIPPED,
                        skillName: resolved.name,
                        skillId: effectiveId,
                    } as any);
                    const result = { found: true, skipped: true, message: `Skill "${resolved.name}" was skipped by the user.` };
                    eventHandler({ type: "tool_result", toolName: SKILL_TOOL_NAME, toolOutput: result, toolCallId } as any);
                    return result;
                }
            }

            console.debug(`[SkillTool] Skill "${resolved.name}" loaded (${resolvedSource})`);
            const rawContent = resolved.content;
            const content = args ? applySkillArguments(rawContent, args) : rawContent;
            const result = { found: true, skillName: resolved.name, content };
            eventHandler({ type: "tool_result", toolName: SKILL_TOOL_NAME, toolOutput: result, toolCallId } as any);
            return result;
        },
    });
}
