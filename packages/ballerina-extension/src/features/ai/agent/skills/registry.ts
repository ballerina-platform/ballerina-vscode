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
import * as path from 'path';
import { keywords, SkillCommand } from '@wso2/ballerina-core';
import { Skill } from './types';
import { parseSkillMd } from './utils';

// Webpack inlines '.md' as raw source (webpack.config.js); tsc-compiled test builds have no
// such loader, so fall back to reading the SKILL.md next to the compiled module.
function loadSkillMd(loadBundled: () => string, dir: string): string {
    try {
        return loadBundled();
    } catch {
        return fs.readFileSync(path.join(__dirname, dir, 'SKILL.md'), 'utf-8');
    }
}
const dataMapMd = loadSkillMd(() => require('./data-map/SKILL.md'), 'data-map');
const skillCreatorMd = loadSkillMd(() => require('./skill-creator/SKILL.md'), 'skill-creator');

// data-map skill
const dataMap = parseSkillMd(dataMapMd);
if (!dataMap.name || !dataMap.description) {
    throw new Error(`[data-map] SKILL.md is missing required frontmatter fields (name="${dataMap.name}", description="${dataMap.description}")`);
}
const keywordList = keywords.map((k: string) => `\`${k}\``).join(', ');

export const dataMapSkill: Skill = {
    name: dataMap.name,
    trigger: dataMap.description,
    content: dataMap.body.replace('{{KEYWORDS}}', keywordList),
    optional: false,
    default: true,
    skillCommand: SkillCommand.DataMap,
    commandTemplates: [
        {
            id: 'mappings-for-records',
            text: 'generate mappings using input as <recordname(s)> and output as <recordname> using the <functionname> function',
            placeholders: [
                { id: 'inputRecords', text: '<recordname(s)>', multiline: false },
                { id: 'outputRecord', text: '<recordname>', multiline: false },
                { id: 'functionName', text: '<functionname>', multiline: false },
            ],
        },
        {
            id: 'mappings-for-function',
            text: 'generate mappings for the <functionname> function',
            placeholders: [
                { id: 'functionName', text: '<functionname>', multiline: false },
            ],
        },
        {
            id: 'inline-mappings',
            text: 'generate mappings using record fields and external values',
            placeholders: [],
            defaultVisibility: false,
        },
    ],
};

// skill-creator skill
const skillCreator = parseSkillMd(skillCreatorMd);

export const skillCreatorSkill: Skill = {
    name: skillCreator.name,
    trigger: skillCreator.description,
    content: skillCreator.body,
    optional: true,
    default: false,
};

export const REGISTERED_SKILLS: Skill[] = [
    dataMapSkill,
    skillCreatorSkill,
];
