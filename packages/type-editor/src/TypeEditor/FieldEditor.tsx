/**
 * Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
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

import React, { useRef, useState } from 'react';
import { Imports, Member, Type } from '@wso2/ballerina-core';
import { Button, CheckBox, Codicon, TextField } from '@wso2/ui-toolkit';
import styled from '@emotion/styled';
import { typeToSource, defaultAnonymousRecordType, isGraphQLScalarType } from './TypeUtil';
import { RecordEditor } from './RecordEditor';
import { AdvancedOptions } from './AdvancedOptions';
import { IdentifierField } from './IdentifierField';
import { TypeField } from './TypeField';
import { OptionalFieldIcon, CurlyBracesIcon } from '../assets/icons';

interface FieldEditorProps {
    member: Member;
    onChange: (member: Member) => void;
    type: Type;
    onValidationError: (isError: boolean) => void;
    onFieldValidation: (isIdentifier: boolean, hasError: boolean) => void;
    onRecordValidation: (hasError: boolean) => void;
    onDelete: () => void;
    isGraphql?: boolean;
    index: number;
}

const ButtonDeactivated = styled.div<{}>`
    opacity: 0.5;
`;

const ButtonActive = styled.div<{}>`
    opacity: 1;
    color: 'var(--vscode-editorWarning-foreground)';
`;

const ExpandIconButton = styled(Button)`
    padding: 4px;
    &:hover {
        background: transparent;
    }
`;

const CollapsibleSection = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
    border: 1px solid var(--vscode-welcomePage-tileBorder);
    margin-left: 25px;
    margin-bottom: 10px;
    padding: 8px;
    border-radius: 4px;
`;

const CheckBoxGroup = styled.div`
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding-left: 5px;
`;

export const FieldEditor: React.FC<FieldEditorProps> = (props) => {
    const { member, onChange, onDelete, type, onValidationError, onFieldValidation, onRecordValidation, isGraphql, index } = props;
    const [panelOpened, setPanelOpened] = useState<boolean>(false);
    const recordEditorRef = useRef<{ addMember: () => void }>(null);
    const currentImports = useRef<Imports | undefined>();

    const toggleOptional = () => {
        onChange({
            ...member,
            optional: !member.optional
        });
    };

    const handleDescriptionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        onChange({
            ...member,
            docs: e.target.value
        });
    }

    const handleNameChange = (value: string) => {
        onChange({
            ...member,
            name: value
        });
    }

    const handleTypeChange = (value: string) => {
        onChange({
            ...member,
            type: value,
            imports: currentImports.current
        });
        currentImports.current = undefined;
    }

    const handleUpdateImports = (imports: Imports) => {
        const newImportKey = Object.keys(imports)[0];
        if (!member.imports || !Object.keys(member.imports)?.includes(newImportKey)) {
            const updatedImports = { ...member.imports, ...imports };
            currentImports.current = updatedImports;
        }
    }

    const handleMemberDefaultValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        onChange({
            ...member,
            defaultValue: e.target.value
        });
    }

    const toggleRecord = () => {
        if (!isRecord(member.type)) {
            onChange({
                ...member,
                //@ts-ignore
                type: defaultAnonymousRecordType
            });
        } else {
            onChange({
                ...member,
                type: 'string'
            });
        }
    }

    const isRecord = (type: string | Type): boolean => {
        // if type is not a string, check if it is a record
        if (typeof type === 'object') {
            return type.codedata.node === 'RECORD';
        }
        return false;
    }

    return (
        <>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'start', justifyContent: 'space-between' }}>
                <ExpandIconButton
                    data-testid={`field-expand-btn`}
                    appearance="icon"
                    onClick={() => setPanelOpened(!panelOpened)}
                >
                    <Codicon name={panelOpened ? "chevron-down" : "chevron-right"} />
                </ExpandIconButton>
                <div style={{ width: '100%' }}>
                    <IdentifierField
                        value={member.name}
                        onChange={handleNameChange}
                        rootType={type}
                        isGraphql={isGraphql}
                        onValidationError={(hasError) => onFieldValidation(true, hasError)}
                    />
                </div>
                <div style={{ width: '100%' }}>
                    <TypeField
                        fieldIndex={index}
                        type={member.type}
                        memberName={typeToSource(member.type)}
                        onChange={handleTypeChange}
                        onUpdateImports={handleUpdateImports}
                        onValidationError={(hasError) => onFieldValidation(false, hasError)}
                        rootType={type}
                        isAnonymousRecord={isRecord(member.type)}
                    />
                </div>
                <div style={{ display: 'flex', gap: '1px' }}>
                    {isRecord(member.type) &&
                        <Button appearance="icon" onClick={() => recordEditorRef.current?.addMember()} tooltip='Add Field'>
                            <Codicon name="add" />
                        </Button>
                    }
                    <Button appearance="icon" onClick={toggleRecord} tooltip='Create Inline Record'>
                        <CurlyBracesIcon isActive={isRecord(member.type)} />
                    </Button>
                    <Button appearance="icon" onClick={toggleOptional} tooltip='Set as an Optional Field'>
                        <OptionalFieldIcon isActive={member?.optional} />
                    </Button>
                    <Button appearance="icon" onClick={onDelete} tooltip='Delete Field'>
                        <Codicon name="trash" />
                    </Button>
                </div>
            </div>
            {panelOpened && (
                <CollapsibleSection>
                    <TextField label='Default Value' value={member.defaultValue} onChange={handleMemberDefaultValueChange} style={{ width: '180px' }} />
                    <TextField label='Description' value={member.docs} onChange={handleDescriptionChange} style={{ width: '180px' }} />
                    <CheckBoxGroup>
                        <CheckBox
                            label="Readonly"
                            checked={member.readonly}
                            onChange={(checked: boolean) => {
                                onChange({
                                    ...member,
                                    readonly: checked
                                }
                                );
                            }}
                        />
                        {isGraphql && isGraphQLScalarType(member.type) &&
                            <CheckBox
                                label="ID Type"
                                checked={member.isGraphqlId || false}
                                onChange={(checked: boolean) => {
                                    onChange({
                                        ...member,
                                        isGraphqlId: checked
                                    });
                                }}
                            />
                        }
                    </CheckBoxGroup>
                </CollapsibleSection>
            )}
            {isRecord(member.type) && typeof member.type !== 'string' && (
                <div style={{ marginLeft: '24px' }}>
                    <RecordEditor
                        ref={recordEditorRef}
                        isAnonymous={true}
                        type={member.type as Type}
                        onChange={(type: Type) => onChange({ ...member, type })}
                        onValidationError={(hasError) => onRecordValidation(hasError)}
                    />
                    <AdvancedOptions type={member.type as Type} onChange={(type: Type) => onChange({ ...member, type })} />
                </div>
            )}
        </>
    );
};
