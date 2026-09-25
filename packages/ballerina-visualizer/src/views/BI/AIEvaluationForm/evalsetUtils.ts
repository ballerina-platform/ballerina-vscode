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

import { AvailableNode, EvaluationTemplateOption } from "@wso2/ballerina-core";
import { getTemplateKind } from "./templateUtils";

/** Resolves the project-relative path returned by evalset discovery for the VS Code viewer command. */
export const resolveEvalsetPath = (projectPath: string, evalsetFile: string): string => {
    const isAbsolutePath = /^(?:[A-Za-z]:[\\/]|\/)/.test(evalsetFile);
    if (isAbsolutePath) {
        return evalsetFile;
    }
    const hasTrailingSeparator = /[\\/]$/.test(projectPath);
    const separator = projectPath.includes('\\') ? '\\' : '/';
    return `${projectPath}${hasTrailingSeparator ? '' : separator}${evalsetFile}`;
};

const EVALSETS_DIR = 'tests/resources/evalsets';

const toKebabCase = (value: string): string => value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();

const evalsetName = (file: string): string => file.split('/').pop().replace(/\.evalset\.json$/, '');

/** A path for a new evalset whose name none of the listed evalsets use. */
export const newEvalsetPath = (baseName: string, evalsetFiles: string[]): string => {
    const taken = new Set(evalsetFiles.map(evalsetName));
    const base = toKebabCase(baseName) || 'evalset';
    let name = base;
    for (let suffix = 2; taken.has(name); suffix++) {
        name = `${base}-${suffix}`;
    }
    return `${EVALSETS_DIR}/${name}.evalset.json`;
};

const EVALSET_THREAD_COUNT = 5;

const JUDGE_GUIDANCE = 'An LLM judge grades each run against the criterion, and some judges compare the answer with '
    + 'the expected one. Prefer requests whose answers need an explanation, several steps or a judgment call, and '
    + 'write each expected answer the way a correct agent following its instructions would.';
const RULE_GUIDANCE = 'A rule compares each run with the expected values in the evalset, such as the tool calls, '
    + 'their order and arguments, or the answer, using the options below. Make every expected value exactly what a '
    + 'correct run produces.';

const describeTemplate = (template: AvailableNode, options: EvaluationTemplateOption[]): string => {
    const kind = getTemplateKind(template);
    const settings = options
        .filter(option => option.value)
        .map(option => `- ${option.name} = ${option.value}${option.description ? ` (${option.description})` : ''}`);
    return [
        `It is the test data for the ${template.metadata.label} evaluation (${kind}): `
            + `${template.metadata.description}. Write conversations that show whether the agent meets that criterion.`,
        `The evaluation calls \`eval:${template.codedata.symbol}\`; ask the Librarian what it compares if unsure.`,
        kind.includes('LLM') ? JUDGE_GUIDANCE : RULE_GUIDANCE,
        settings.length > 0 && `Its settings:\n${settings.join('\n')}`,
    ].filter(Boolean).join('\n');
};

export const buildEvalsetPrompt = (agent: string, filePath: string, template?: AvailableNode,
    options: EvaluationTemplateOption[] = []): string => [
    `Create the evalset \`${filePath}\`, named \`${evalsetName(filePath)}\`, for the agent \`${agent}\`. Write only this file.`,
    template
        ? describeTemplate(template, options)
        : 'Write conversations that cover the main tasks in its instructions.',
    `Write ${EVALSET_THREAD_COUNT} threads unless the user asks for another number. Mix single-turn and multi-turn `
        + 'threads, use each tool at least once, and include one request the agent should decline.',
    'Give each thread a short kebab-case id that names its scenario: the report lists results by thread id.',
    'Read the source of the tools the agent uses and the data files they read. Base every expected answer and '
        + 'tool-call argument on what you read, and never invent values.',
    'If the agent\'s behaviour or its data is unclear, ask the user before you write the file.',
    'Do not run any evaluation.',
    'You MUST call invoke_skill with skillName="agent-evals" and follow its evalset file rules.',
].join('\n');
