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

// A leaf module with no imports, so the prompt-prefix planner and its tests can load it.

/** The header over the skills listing, in the first listing and in a later notice of new skills. */
export const SKILL_LISTING_HEADER = 'The following skills are available for use with the `invoke_skill` tool:';

/**
 * Every skill, enabled or not, by name and trigger. The listing carries no on/off state, so a later
 * toggle needs no notice: `invoke_skill` reads the disabled set when it is called.
 */
export function getSkillsListing(skills: ReadonlyArray<{ name: string; trigger: string }>): string {
    if (skills.length === 0) { return ''; }
    return `${SKILL_LISTING_HEADER}\n\n${skills.map(s => `- ${s.name}: ${s.trigger}`).join('\n')}`;
}
