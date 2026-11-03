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

// The barrel pulls in an ESM-only websocket client; node-property-utils needs only these at runtime.
jest.mock('@wso2/ballerina-core', () => ({
    getPrimaryInputType: (types: any[]) => types?.[0],
    isTemplateType: () => false,
    isDropDownType: () => false,
}));

import type { FormGroupData, NodeProperties, Property } from '@wso2/ballerina-core';
import { convertNodePropertiesToFormFields, getFormGroups } from './node-property-utils';

const AUDIENCE: FormGroupData = {
    id: 'audience', label: 'Who decides', description: 'Fill in the roles, the users, or both', collapsed: false,
    requireAnyOf: ['userRoles', 'users'],
};
const DETAILS: FormGroupData = { id: 'details', label: 'Details', parent: 'audience' };

function property(group?: FormGroupData, hidden = false): Property {
    return {
        metadata: { label: 'Field', description: '', ...(group ? { data: { group } } : {}) },
        types: [{ fieldType: 'TEXT_SET', selected: true } as any],
        value: '',
        optional: true,
        editable: true,
        advanced: false,
        hidden,
    } as Property;
}

function fieldsOf(properties: Record<string, Property>) {
    return convertNodePropertiesToFormFields(properties as unknown as NodeProperties);
}

describe('form groups declared by the language server', () => {
    const corpus: Record<string, Record<string, Property>> = {
        'one group': { userRoles: property(AUDIENCE), users: property(AUDIENCE), title: property() },
        'two groups, interleaved': {
            taskName: property(), userRoles: property(AUDIENCE), title: property(DETAILS), users: property(AUDIENCE),
        },
        'no groups': { taskName: property(), title: property() },
        'a group whose only member is hidden': { userRoles: property(AUDIENCE, true), title: property() },
    };

    it.each(Object.entries(corpus))('every visible grouped field names a rendered group (%s)', (_, properties) => {
        const fields = fieldsOf(properties);
        const groups = getFormGroups(fields);
        const ids = groups.map((group) => group.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const field of fields) {
            const declared = (properties[field.key].metadata.data as any)?.group as FormGroupData | undefined;
            expect(field.group).toBe(declared?.id);
            if (declared && !field.hidden) {
                expect(ids).toContain(declared.id);
            }
        }
        for (const group of groups) {
            expect(fields.some((field) => field.group === group.id && !field.hidden)).toBe(true);
        }
    });

    it('orders groups by their first member and carries the declared label, description, default, ask and parent', () => {
        const groups = getFormGroups(fieldsOf(corpus['two groups, interleaved']));
        expect(groups.map((group) =>
            [group.id, group.label, group.description, group.defaultCollapsed, group.requireAnyOf, group.parent]))
            .toEqual([
                ['audience', 'Who decides', 'Fill in the roles, the users, or both', false, ['userRoles', 'users'], undefined],
                ['details', 'Details', undefined, true, [], 'audience'],
            ]);
    });
});
