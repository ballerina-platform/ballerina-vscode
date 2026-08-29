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

import { AvailableNode } from "@wso2/ballerina-core";

const NAME_PREFIX = 'evaluate';
const CUSTOM_NAME = 'customEvaluation';
const IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const SYMBOL_VERB = /^(evaluate|assert|check|test)(?=[A-Z_])/;

const toPascalCase = (text: string): string =>
    text.replace(/[^a-zA-Z0-9]+/g, ' ')
        .trim()
        .split(' ')
        .filter(Boolean)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join('');

const templateToken = (template?: AvailableNode): string => {
    const symbol = String(template?.codedata?.symbol || '');
    return toPascalCase(String(template?.metadata?.label || ''))
        || toPascalCase(symbol.replace(SYMBOL_VERB, ''))
        || toPascalCase(symbol);
};

const agentToken = (hasAgent: boolean, agentValue: string): string => {
    if (hasAgent) {
        return IDENTIFIER.test(agentValue.trim()) ? toPascalCase(agentValue.trim()) : '';
    }
    return '';
};

const uniqueName = (base: string, takenNames: Iterable<string>): string => {
    const taken = new Set(takenNames);
    if (!taken.has(base)) {
        return base;
    }
    let suffix = 2;
    while (taken.has(`${base}${suffix}`)) {
        suffix++;
    }
    return `${base}${suffix}`;
};

export const suggestEvaluationName = (args: {
    template?: AvailableNode;
    hasAgent?: boolean;
    agentValue?: string;
    takenNames: Iterable<string>;
}): string => {
    const template = templateToken(args.template);
    if (!template) {
        return uniqueName(CUSTOM_NAME, args.takenNames);
    }
    const subject = agentToken(Boolean(args.hasAgent), args.agentValue || '');
    return uniqueName(`${NAME_PREFIX}${subject}${template}`, args.takenNames);
};
