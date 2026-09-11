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

/**
 * The only mock here is @wso2/ballerina-core.  Its barrel export (lib/index.js)
 * re-exports WSConnection which requires vscode-ws-jsonrpc — an ESM-only
 * package that jest cannot load without additional Babel/transform config.
 * Rather than fight that toolchain, we mock the three tiny pure functions that
 * node-property-utils actually calls at runtime.  Everything else is real code.
 */
jest.mock('@wso2/ballerina-core', () => ({
    getPrimaryInputType: (types: any[]) => types?.[0],
    isTemplateType: (value: any) =>
        value !== null && typeof value === 'object' && 'template' in value,
    isDropDownType: (value: any) =>
        value !== null &&
        'options' in value &&
        (value?.fieldType === 'SINGLE_SELECT' || value?.fieldType === 'MULTIPLE_SELECT'),
}));

import type { NodeProperties, Property } from '@wso2/ballerina-core';
import { convertNodePropertiesToFormFields, updateNodeProperties } from './node-property-utils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// NodePropertyKey does not list every key the product uses (options, retryPolicy, maxRetries, ...),
// so property maps are read as a record of Property rather than through `any`.
const rootProperty = (properties: NodeProperties, key: string): Property =>
    (properties as Record<string, Property>)[key];

function makeProperty(overrides: Partial<Property> & { fieldType: string }): Property {
    const { fieldType, metadata: metaOverride, ...rest } = overrides;
    return {
        metadata: { label: 'Field', description: '', ...metaOverride },
        types: [{ fieldType, selected: true } as any],
        value: '',
        optional: false,
        editable: true,
        advanced: false,
        hidden: false,
        ...rest,
    } as Property;
}

// ---------------------------------------------------------------------------
// convertNodePropertiesToFormFields
// ---------------------------------------------------------------------------

describe('convertNodePropertiesToFormFields', () => {
    describe('ADVANCE_PARAM_LIST flattening', () => {
        it('flattens sub-properties into top-level fields with parentKey__subKey', () => {
            const subOptionsProp = makeProperty({
                fieldType: 'RECORD_MAP_EXPRESSION',
                metadata: { label: 'Options' },
                optional: true,
                advanced: true,
            });

            const nodeProperties = {
                options: makeProperty({
                    fieldType: 'ADVANCE_PARAM_LIST',
                    metadata: { label: 'Activity call configurations' },
                    value: { options: subOptionsProp } as any,
                    optional: false,
                    editable: false,
                }),
            };

            const fields = convertNodePropertiesToFormFields(nodeProperties);

            // The parent ADVANCE_PARAM_LIST field must NOT appear
            expect(fields.find((f) => f.key === 'options')).toBeUndefined();

            // The sub-property must appear with a prefixed key
            const subField = fields.find((f) => f.key === 'options__options');
            expect(subField).toBeDefined();
            expect(subField?.label).toBe('Options');
            expect(subField?.optional).toBe(true);
            expect(subField?.advanced).toBe(true);
        });

        it('flattens multiple sub-properties from the same ADVANCE_PARAM_LIST', () => {
            const nodeProperties: NodeProperties = {
                options: makeProperty({
                    fieldType: 'ADVANCE_PARAM_LIST',
                    value: {
                        retryPolicy: makeProperty({ fieldType: 'EXPRESSION', metadata: { label: 'Retry Policy' } }),
                        timeout: makeProperty({ fieldType: 'EXPRESSION', metadata: { label: 'Timeout' } }),
                    } as any,
                }),
            };

            const fields = convertNodePropertiesToFormFields(nodeProperties);

            expect(fields).toHaveLength(2);
            expect(fields.map((f) => f.key).sort()).toEqual(['options__retryPolicy', 'options__timeout'].sort());
        });

        it('does not produce a field for the ADVANCE_PARAM_LIST parent itself', () => {
            const nodeProperties: NodeProperties = {
                options: makeProperty({
                    fieldType: 'ADVANCE_PARAM_LIST',
                    value: {
                        inner: makeProperty({ fieldType: 'TEXT' }),
                    } as any,
                }),
            };

            const fields = convertNodePropertiesToFormFields(nodeProperties);
            expect(fields.every((f) => !f.key.startsWith('options') || f.key.includes('__'))).toBe(true);
        });
    });

    describe('regular (non-ADVANCE_PARAM_LIST) properties', () => {
        it('returns a field for each regular property with its original key', () => {
            const nodeProperties: NodeProperties = {
                variable: makeProperty({ fieldType: 'IDENTIFIER', metadata: { label: 'Result' } }),
                type: makeProperty({ fieldType: 'TYPE', metadata: { label: 'Result Type' } }),
            };

            const fields = convertNodePropertiesToFormFields(nodeProperties);

            expect(fields).toHaveLength(2);
            expect(fields.map((f) => f.key).sort()).toEqual(['type', 'variable'].sort());
        });

        it('maps label, optional, advanced, and editable from the property', () => {
            const nodeProperties: NodeProperties = {
                variable: makeProperty({
                    fieldType: 'IDENTIFIER',
                    metadata: { label: 'My Label' },
                    optional: true,
                    advanced: true,
                    editable: false,
                }),
            };

            const [field] = convertNodePropertiesToFormFields(nodeProperties);

            expect(field.label).toBe('My Label');
            expect(field.optional).toBe(true);
            expect(field.advanced).toBe(true);
            expect(field.editable).toBe(false);
        });
    });

    describe('mixed properties', () => {
        it('handles a mix of regular and ADVANCE_PARAM_LIST properties together', () => {
            const nodeProperties: NodeProperties = {
                variable: makeProperty({ fieldType: 'IDENTIFIER', metadata: { label: 'Result' } }),
                options: makeProperty({
                    fieldType: 'ADVANCE_PARAM_LIST',
                    value: {
                        retryOptions: makeProperty({ fieldType: 'EXPRESSION', metadata: { label: 'Retry' } }),
                    } as any,
                }),
            };

            const fields = convertNodePropertiesToFormFields(nodeProperties);

            expect(fields).toHaveLength(2);
            expect(fields.map((f) => f.key).sort()).toEqual(['options__retryOptions', 'variable'].sort());
        });
    });

    describe('GROUP_SECTION children', () => {
        it('becomes a form field under its own key, which is the key its value is stored under', () => {
            const fields = convertNodePropertiesToFormFields({
                autoRetryOptions: makeProperty({
                    fieldType: 'GROUP_SECTION',
                    metadata: { label: 'Advanced Configurations', description: '' },
                    advanceProperties: {
                        maxRetries: makeProperty({ fieldType: 'EXPRESSION', optional: true }),
                        retryDelay: makeProperty({ fieldType: 'EXPRESSION', optional: true }),
                    },
                } as any),
            } as NodeProperties);

            const group = fields.find((f) => f.key === 'autoRetryOptions');
            expect(group?.advanceProps?.map((f) => f.key)).toEqual(['maxRetries', 'retryDelay']);
        });
    });
});

// ---------------------------------------------------------------------------
// updateNodeProperties
// ---------------------------------------------------------------------------

describe('updateNodeProperties', () => {
    // The Auto Retry tuning fields are declared inside the retry policy's AutoRetry branch, but their
    // values live in root properties of the same key - which is what source generation reads. The form
    // registers each field under its own key, so submitting carries the edit to the root property.
    describe('retry policy group fields', () => {
        const retryNodeProperties = (): NodeProperties => {
            const child = (fieldType: string) => makeProperty({ fieldType, value: '', optional: true });
            return {
                retryPolicy: makeProperty({
                    fieldType: 'DROPDOWN_CHOICE',
                    value: 'NoRetry',
                    dynamicFormFields: {
                        NoRetry: {},
                        AutoRetry: {
                            autoRetryOptions: makeProperty({
                                fieldType: 'GROUP_SECTION',
                                value: '',
                                optional: true,
                                advanceProperties: {
                                    maxRetries: child('EXPRESSION'),
                                    retryDelay: child('EXPRESSION'),
                                },
                            } as any),
                        },
                    },
                } as any),
                maxRetries: makeProperty({ fieldType: 'EXPRESSION', value: '', hidden: true, optional: true }),
                retryDelay: makeProperty({ fieldType: 'EXPRESSION', value: '1.5', hidden: true, optional: true }),
            } as NodeProperties;
        };

        it('carries an edited group field to the root property source generation reads', () => {
            const updated = updateNodeProperties(
                { retryPolicy: 'AutoRetry', maxRetries: '5', retryDelay: '2.5' },
                retryNodeProperties(),
                {}
            );

            expect(rootProperty(updated, 'retryPolicy').value).toBe('AutoRetry');
            expect(rootProperty(updated, 'maxRetries').value).toBe('5');
            expect(rootProperty(updated, 'retryDelay').value).toBe('2.5');
        });

        it('keeps a root field that the submitted form did not carry', () => {
            const updated = updateNodeProperties(
                { retryPolicy: 'AutoRetry', maxRetries: '5' },
                retryNodeProperties(),
                {}
            );

            expect(rootProperty(updated, 'maxRetries').value).toBe('5');
            // Seeded with a value, so this asserts the field was preserved rather than merely empty.
            expect(rootProperty(updated, 'retryDelay').value).toBe('1.5');
        });
    });

    describe('ADVANCE_PARAM_LIST re-nesting', () => {
        it('writes form values back into the correct sub-property', () => {
            const subOptionsProp = makeProperty({
                fieldType: 'RECORD_MAP_EXPRESSION',
                value: '()',
            });

            const nodeProperties: NodeProperties = {
                options: makeProperty({
                    fieldType: 'ADVANCE_PARAM_LIST',
                    value: { options: subOptionsProp } as any,
                }),
            };

            const updated = updateNodeProperties(
                { 'options__options': '{ scheduleToCloseTimeout: "10s" }' },
                nodeProperties,
                {}
            );

            const subProps = updated.options!.value as Record<string, Property>;
            expect(subProps.options.value).toBe('{ scheduleToCloseTimeout: "10s" }');
        });

        it('marks the sub-property as modified when it appears in dirtyFields', () => {
            const nodeProperties: NodeProperties = {
                options: makeProperty({
                    fieldType: 'ADVANCE_PARAM_LIST',
                    value: { options: makeProperty({ fieldType: 'EXPRESSION', value: '()' }) } as any,
                }),
            };

            const updated = updateNodeProperties(
                { 'options__options': 'newValue' },
                nodeProperties,
                {},
                { 'options__options': true }
            );

            const subProps = updated.options!.value as Record<string, Property>;
            expect(subProps.options.modified).toBe(true);
        });

        it('does not mark the sub-property as modified when key is absent from dirtyFields', () => {
            const nodeProperties: NodeProperties = {
                options: makeProperty({
                    fieldType: 'ADVANCE_PARAM_LIST',
                    value: { options: makeProperty({ fieldType: 'EXPRESSION', value: '()' }) } as any,
                }),
            };

            const updated = updateNodeProperties(
                { 'options__options': 'newValue' },
                nodeProperties,
                {},
                {}
            );

            const subProps = updated.options!.value as Record<string, Property>;
            expect(subProps.options.modified).toBe(false);
        });

        it('stores imports on the sub-property when provided', () => {
            const nodeProperties: NodeProperties = {
                options: makeProperty({
                    fieldType: 'ADVANCE_PARAM_LIST',
                    value: { opts: makeProperty({ fieldType: 'EXPRESSION', value: '()' }) } as any,
                }),
            };

            const updated = updateNodeProperties(
                { 'options__opts': 'value' },
                nodeProperties,
                { 'options__opts': { workflow: 'ballerina/workflow' } }
            );

            const subProps = updated.options!.value as Record<string, Property>;
            expect(subProps.opts.imports).toEqual({ workflow: 'ballerina/workflow' });
        });

        it('handles a key with __ that does NOT match any ADVANCE_PARAM_LIST parent gracefully', () => {
            const nodeProperties: NodeProperties = {
                variable: makeProperty({ fieldType: 'IDENTIFIER', value: 'result' }),
            };

            const updated = updateNodeProperties({ 'some__key': 'value' }, nodeProperties, {});

            expect(updated.variable!.value).toBe('result');
        });
    });

    describe('regular (non-ADVANCE_PARAM_LIST) properties', () => {
        it('updates value directly for regular properties', () => {
            const nodeProperties: NodeProperties = {
                variable: makeProperty({ fieldType: 'IDENTIFIER', value: 'oldName' }),
            };

            const updated = updateNodeProperties({ variable: 'newName' }, nodeProperties, {});
            expect(updated.variable!.value).toBe('newName');
        });

        it('marks the property as modified when it appears in dirtyFields', () => {
            const nodeProperties: NodeProperties = {
                variable: makeProperty({ fieldType: 'IDENTIFIER', value: 'name' }),
            };

            const updated = updateNodeProperties(
                { variable: 'changed' },
                nodeProperties,
                {},
                { variable: true }
            );
            expect(updated.variable!.modified).toBe(true);
        });

        it('does not modify properties whose keys are absent from form values', () => {
            const nodeProperties: NodeProperties = {
                variable: makeProperty({ fieldType: 'IDENTIFIER', value: 'unchanged' }),
                type: makeProperty({ fieldType: 'TYPE', value: 'string' }),
            };

            const updated = updateNodeProperties({ variable: 'changed' }, nodeProperties, {});
            expect(updated.type!.value).toBe('string');
        });
    });
});
