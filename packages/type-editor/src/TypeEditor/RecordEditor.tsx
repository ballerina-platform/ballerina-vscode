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

interface RecordEditorProps {
    type: Type;
    isAnonymous: boolean;
    onChange: (type: Type) => void;
    isGraphql?: boolean;
    newType?: boolean;
    onValidationError: (isError: boolean) => void;
}

interface FieldValidationError {
    identifier: boolean;
    type: boolean;
}

export const RecordEditor = forwardRef<{ addMember: () => void }, RecordEditorProps>((props, ref) => {
    const { type, isAnonymous = false, onChange, isGraphql, onValidationError, newType } = props;

    const [validationErrors, setValidationErrors] = useState<FieldValidationError[]>([{ identifier: false, type: false }]);
    const [hasRecordError, setHasRecordError] = useState(false);


    const handleFieldValidation = (functionIndex: number, isIdentifier: boolean, hasError: boolean) => {
        setValidationErrors(prev => {
            const current = prev[functionIndex];
            // Bail out when the outcome is unchanged. Returning a new array on every validation
            // callback churns this state, and the effect below is keyed on its identity.
            if (current && (isIdentifier ? current.identifier : current.type) === hasError) {
                return prev;
            }

            const newErrors = [...prev];
            const entry = current ?? { identifier: false, type: false };
            newErrors[functionIndex] = isIdentifier
                ? { ...entry, identifier: hasError }
                : { ...entry, type: hasError };

            return newErrors;
        });
    };

    // Handle nested record validation
    const handleNestedRecordError = (hasError: boolean) => {
        setHasRecordError(hasError);
    };

    useEffect(() => {
        // Check if any field has validation errors OR if there's a nested record error
        const hasAnyFieldError = validationErrors.some(error => error && (error.identifier || error.type));
        const hasAnyError = hasAnyFieldError || hasRecordError;
        onValidationError?.(hasAnyError);
    }, [validationErrors, hasRecordError, onValidationError]);

    const addMember = () => {
        const memberCount = Object.keys(type.members).length;
        const newMemberName = `name${memberCount + 1}`;
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
        const newMembers = type.members.filter((_, i) => i !== index);
        onChange({ ...type, members: newMembers });
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
                <>
                    <FieldEditor
                        index={index}
                        isGraphql={isGraphql}
                        key={index}
                        member={member}
                        onChange={handleMemberChange(index)}
                        onDelete={handleDeleteMember(index)}
                        type={type}
                        onValidationError={onValidationError}
                        onFieldValidation={(isIdentifier, hasError) => handleFieldValidation(index, isIdentifier, hasError)}
                        onRecordValidation={handleNestedRecordError}
                    />
                </>
            ))}
        </div >
    );
});
