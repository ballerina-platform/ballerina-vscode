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
import { getDisabledBuiltIns } from './index';
import { scanProjectSkills, scanUserSkills } from '../tools/skill-tool/skill-reader';
import { getSkillsConfig } from '../tools/skill-tool/skill-writer';

export interface SkillsContext {
    allDisabled: Set<string>;
    projectSkills: ProjectSkillMeta[];
    userSkills: ProjectSkillMeta[];
    disabledSkillMetas: Array<{ name: string; trigger: string }>;
}

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

/** Full skills context needed to build agent prompts and the skill tool. */
export function loadSkillsContext(projectRootPath: string | null): SkillsContext {
    const allDisabled = buildAllDisabledSet(projectRootPath);
    const allProjectSkills = projectRootPath ? scanProjectSkills(projectRootPath) : [];
    const allUserSkills = scanUserSkills();
    return {
        allDisabled,
        projectSkills: allProjectSkills.filter(s => !allDisabled.has(s.name)),
        userSkills:    allUserSkills.filter(s => !allDisabled.has(s.name)),
        disabledSkillMetas: [
            ...getDisabledBuiltIns(allDisabled),
            ...allProjectSkills.filter(s => allDisabled.has(s.name)),
            ...allUserSkills.filter(s => allDisabled.has(s.name)),
        ],
    };
}
