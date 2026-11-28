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

import React, { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { Member, Type } from '@wso2/ballerina-core';
import { Codicon } from '@wso2/ui-toolkit';
import { Button } from '@wso2/ui-toolkit';
import { FieldEditor } from './FieldEditor';
import styled from '@emotion/styled';
import { duplicateNames, useRowKeys } from './TypeUtil';
import { AssistMark } from '@wso2/ballerina-side-panel';


const Header = styled.div`
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        padding: 8px 0px;
    `;

const SectionTitle = styled.div`
        font-size: 13px;
        font-weight: 500;
        color: var(--vscode-editor-foreground);
        margin-bottom: 4px;
    `;

const ValidationMessage = styled.div`
        color: var(--vscode-errorForeground);
        font-size: 12px;
        margin-top: 8px;
    `;

interface RecordEditorProps {
    type: Type;
    isAnonymous: boolean;
    onChange: (type: Type) => void;
    isGraphql?: boolean;
    newType?: boolean;
    onValidationError: (isError: boolean) => void;
}

interface FieldValidationError {
    identifier?: boolean;
    type?: boolean;
    // A nested inline record's own errors.
    record?: boolean;
}

export const RecordEditor = forwardRef<{ addMember: () => void }, RecordEditorProps>((props, ref) => {
    const { type, isAnonymous = false, onChange, isGraphql, onValidationError, newType } = props;

    const [validationErrors, setValidationErrors] = useState<Record<string, FieldValidationError>>({});
    const { keys, remove } = useRowKeys(type.members.length);
    const duplicates = duplicateNames(type.members.map((member) => member.name));

    const handleFieldValidation = (key: string, part: keyof FieldValidationError, hasError: boolean) => {
        // Bail out when the outcome is unchanged, so the effect below doesn't run on every check.
        setValidationErrors(prev => (!!prev[key]?.[part] === hasError ? prev : { ...prev, [key]: { ...prev[key], [part]: hasError } }));
    };

    const hasAnyError = duplicates.length > 0
        || keys.some((key) => validationErrors[key]?.identifier || validationErrors[key]?.type || validationErrors[key]?.record);
    useEffect(() => {
        onValidationError?.(hasAnyError);
    }, [hasAnyError, onValidationError]);

    const addMember = () => {
        const names = new Set(type.members.map((member) => member.name));
        let count = type.members.length + 1;
        while (names.has(`name${count}`)) {
            count++;
        }
        const newMemberName = `name${count}`;
        const newMember: Member = {
            name: newMemberName,
            type: "string",
            kind: "FIELD",
            refs: [],
            docs: ""
        }
        onChange({ ...type, members: [...type.members, newMember] });
    }

    useImperativeHandle(ref, () => ({
        addMember
    }));

    const handleMemberChange = (index: number) => (member: Member) => {
        const newMembers = [...type.members];
        newMembers[index] = member;
        onChange({ ...type, members: newMembers });
    }

    const handleDeleteMember = (index: number) => () => {
        const key = keys[index];
        remove(index);
        setValidationErrors(({ [key]: _removed, ...rest }) => rest);
        onChange({ ...type, members: type.members.filter((_, i) => i !== index) });
    }

    return (
        <div className="record-editor">
            {!isAnonymous &&
                <Header>
                    <SectionTitle>{isGraphql ? (newType ? 'Input Object Fields' : 'Object Fields') : 'Fields'}</SectionTitle>
                    <div style={{ display: 'flex', gap: '8px' }} data-testid="add-field-button">
                        <Button appearance="icon" onClick={addMember} tooltip='Add Field'><Codicon name="add" /></Button>
                    </div>
                </Header>
            }
            {type.members.map((member, index) => (
                <div key={keys[index]}>
                    <FieldEditor
                        index={index}
                        isGraphql={isGraphql}
                        member={member}
                        onChange={handleMemberChange(index)}
                        onDelete={handleDeleteMember(index)}
                        type={type}
                        onValidationError={onValidationError}
                        onFieldValidation={(isIdentifier, hasError) => handleFieldValidation(keys[index], isIdentifier ? "identifier" : "type", hasError)}
                        onRecordValidation={(hasError) => handleFieldValidation(keys[index], "record", hasError)}
                    />
                    {!isAnonymous && <AssistMark fieldKey={`field-${index}`} />}
                </div>
            ))}
            {!isAnonymous && <div><AssistMark fieldKey="fields" /></div>}
            {duplicates.length > 0 && (
                <ValidationMessage>Field names must be unique: {duplicates.join(", ")}</ValidationMessage>
            )}
        </div >
    );
});
