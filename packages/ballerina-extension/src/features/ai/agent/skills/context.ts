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

import { ProjectSkillMeta } from './types';
import { REGISTERED_SKILLS } from './registry';
import { scanProjectSkills, scanUserSkills } from '../tools/skill-tool/skill-reader';
import { getSkillsConfig } from '../tools/skill-tool/skill-writer';

/** Merged set of globally and project-disabled skill IDs, respecting built-in optional/default flags. */
export function buildAllDisabledSet(projectRootPath: string | null): Set<string> {
    const config = getSkillsConfig(projectRootPath);
    const allDisabled = new Set(config.disabledSkills);
    const allEnabled  = new Set(config.enabledSkills);

    for (const skill of REGISTERED_SKILLS) {
        if (skill.optional === false) {
            allDisabled.delete(skill.name);
        } else if (skill.default === false) {
            if (allEnabled.has(skill.name)) {
                allDisabled.delete(skill.name);
            } else {
                allDisabled.add(skill.name);
            }
        }
    }

    return allDisabled;
}

/**
 * Every skill the agent can invoke, enabled or not: built-in, then user, then project. Whether one
 * is disabled is decided by `invoke_skill` when it is called, so the listing never changes on a toggle.
 */
export function listAllSkills(projectRootPath: string | null): ProjectSkillMeta[] {
    return [
        ...REGISTERED_SKILLS.map(s => ({ name: s.name, trigger: s.trigger })),
        ...scanUserSkills(),
        ...(projectRootPath ? scanProjectSkills(projectRootPath) : []),
    ];
}
