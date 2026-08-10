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

import { FormField } from "@wso2/ballerina-side-panel";
import { AvailableNode, FlowNode, Property as FlowProperty } from "@wso2/ballerina-core";
import { convertNodePropertyToFormField } from "../../../utils/bi";
import {
    DataSourceMode, DataSourceParam, isDataSourceSatisfied, partitionTemplateFields
} from "./templateFormUtils";

export { isDataSourceSatisfied, partitionTemplateFields } from "./templateFormUtils";
export type { DataSourceMode, DataSourceParam } from "./templateFormUtils";

export const TEMPLATE_FIELD_PREFIX = 'template_';
export const QUERIES_FIELD_KEY = 'evalQueries';
export const EVALSET_FIELD_KEY = 'evalSetFile';

export type TemplateFilterKind = 'all' | 'rule-based' | 'llm-as-judge' | 'uses-evalset' | 'no-evalset';

export const getTemplateKind = (template: AvailableNode): string => {
    const kind = String(template.codedata.data?.kind || 'RULE_BASED').toUpperCase();
    if (kind.includes('LLM')) {
        return 'LLM-as-Judge';
    }
    if (kind.includes('RULE')) {
        return 'Rule-based';
    }
    return kind.replace(/_/g, '-');
};

export const templateNeedsEvalset = (template?: AvailableNode): boolean =>
    String(template?.codedata.data?.needsEvalset) === 'true';

const TEMPLATE_ICON_RULES: Array<[RegExp, string]> = [
    [/safe|safety|moderat|prohibit|harm/, 'shield'],
    [/latency|perform|speed|duration|time/, 'watch'],
    [/token|budget|cost/, 'dashboard'],
    [/iteration|step|path|efficien/, 'milestone'],
    [/tool|trajector/, 'tools'],
    [/exact|contains|match|semantic|similar/, 'target'],
    [/coheren|reason|logic|flow/, 'graph'],
    [/ground|context|relevan|accura|factual|correct/, 'verified'],
    [/clarity|concise|tone|helpful|readab/, 'sparkle'],
    [/complete|coverage|instruction|follow|checklist/, 'checklist'],
];

export const getTemplateIcon = (template?: AvailableNode): string => {
    const text = `${template?.metadata.label || ''} ${String(template?.codedata.data?.kind || '')}`.toLowerCase();
    for (const [pattern, icon] of TEMPLATE_ICON_RULES) {
        if (pattern.test(text)) {
            return icon;
        }
    }
    return 'beaker';
};

export const matchesTemplateFilter = (template: AvailableNode, filter: TemplateFilterKind): boolean => {
    if (filter === 'all') {
        return true;
    }
    if (filter === 'uses-evalset') {
        return templateNeedsEvalset(template);
    }
    if (filter === 'no-evalset') {
        return !templateNeedsEvalset(template);
    }
    return getTemplateKind(template).toLowerCase() === filter;
};

const AI_AGENT_TYPE = 'ai:Agent';

const withAgentConnectionData = (property: FlowProperty): FlowProperty => {
    const isAgent = property.types?.some(type => type.ballerinaType?.includes(AI_AGENT_TYPE));
    if (!isAgent || (property.codedata?.data as any)?.agent) {
        return property;
    }
    return {
        ...property,
        codedata: {
            ...(property.codedata || {}),
            data: {
                ...((property.codedata?.data as any) || {}),
                agent: { node: 'AGENT', org: 'ballerina', packageName: 'ai', module: 'ai', object: 'Agent' }
            }
        }
    } as FlowProperty;
};

export const findAgentArgument = (node?: FlowNode): { key: string; value: string } | undefined => {
    for (const [key, property] of Object.entries(node?.properties || {})) {
        const templateProperty = property as FlowProperty;
        if (templateProperty.types?.some(type => type.ballerinaType?.includes(AI_AGENT_TYPE))) {
            return { key, value: String(templateProperty.value ?? '') };
        }
    }
    return undefined;
};

const CONVERSATION_THREAD_TYPE = 'ConversationThread';

export const findDataSourceParam = (node: FlowNode): DataSourceParam | undefined => {
    for (const [key, property] of Object.entries(node.properties || {})) {
        const templateProperty = property as FlowProperty;
        const data = templateProperty.codedata?.data as { dataSourceParam?: boolean; dataSourceKind?: string } | undefined;
        const paramName = templateProperty.codedata?.originalName || key;
        if (data?.dataSourceParam) {
            return { paramName, kind: data.dataSourceKind === 'union' ? 'union' : 'strict' };
        }
        const types = (templateProperty.types || []).map(type => String(type.ballerinaType || ''));
        if (types.some(type => type.includes(CONVERSATION_THREAD_TYPE))) {
            return { paramName, kind: types.some(type => type.includes('|')) ? 'union' : 'strict' };
        }
    }
    return undefined;
};

const propertyType = (property?: FlowProperty): string =>
    String(property?.types?.find(type => type.ballerinaType)?.ballerinaType || '');

export const carryOverArguments = (next: FlowNode, previous?: FlowNode): FlowNode => {
    if (!previous?.properties || !next.properties) {
        return next;
    }
    const properties = Object.fromEntries(Object.entries(next.properties).map(([key, property]) => {
        const target = property as FlowProperty;
        const source = (previous.properties as Record<string, FlowProperty>)[key];
        const carry = source && !target.hidden && !source.hidden
            && propertyType(source) === propertyType(target) && source.value;
        return [key, carry ? { ...target, value: source.value } : property];
    }));
    return { ...next, properties } as FlowNode;
};

export const buildQueriesField = (value: string[] = []): FormField => ({
    key: QUERIES_FIELD_KEY,
    label: 'Queries',
    type: 'TEXT_SET',
    optional: false,
    editable: true,
    enabled: true,
    advanced: false,
    hidden: true,
    documentation: 'Each query runs as a separate test case; Minimum Pass Rate applies across them.',
    value,
    types: [{ fieldType: 'TEXT_SET', selected: false }]
} as FormField);

export const generateTemplateFields = (node: FlowNode, dsParamName?: string): FormField[] =>
    Object.entries(node.properties || {})
        .filter(([key, property]) => {
            const templateProperty = property as FlowProperty;
            return !templateProperty.hidden
                && (templateProperty.codedata?.originalName || key) !== dsParamName;
        })
        .map(([key, property]) => ({
            ...convertNodePropertyToFormField(key, withAgentConnectionData(property as FlowProperty)),
            key: `${TEMPLATE_FIELD_PREFIX}${key}`,
            advanced: false
        }));

export const isTemplateField = (field: FormField): boolean => field.key.startsWith(TEMPLATE_FIELD_PREFIX);
