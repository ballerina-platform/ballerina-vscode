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

import { Skill, ProjectSkillMeta } from './types';
import { REGISTERED_SKILLS } from './registry';
import { SKILL_USAGE_RULES } from './constants';

export type { Skill, ProjectSkillMeta };
export { REGISTERED_SKILLS };

/**
 * The fixed skills guidance, the same for every user and project, so it stays in the top-level
 * system prompt. Which skills exist is in the listing (`getSkillsListing`), sent as a system message.
 */
export function getSkillsGuidanceSection(): string {
    return `# Skills

Skills are specialised rule sets for specific tasks. A system message lists the available skills with their trigger conditions, and a later one names any skill added since. **Skills have the highest priority** — always check skill trigger conditions before using any tool directly. When a skill's trigger condition is met, call \`invoke_skill\` to load the full rules, then apply them exactly, including any tool references (library search, web search, sub-skills) the skill specifies.

Skill names tell their source: a plain name is a built-in skill; \`user/<skillName>\` is a skill the user defined in \`~/.ballerina/copilot/skills/\` for all projects; \`<projectName>/<skillName>\` (project-wide) or \`<packageName>/<skillName>\` (package-specific) is a skill defined by the project team. Always call \`invoke_skill\` with the full prefixed name.

The user can disable a listed skill. Call \`invoke_skill\` for it as normal when its trigger condition is met; the tool pauses and asks the user to enable or skip it. If the tool says a skill was not found, it was removed; continue without it.

${SKILL_USAGE_RULES}`;
}
