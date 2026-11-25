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

import React, { useState, useEffect } from "react";
import { TextField, Button, Codicon } from "@wso2/ui-toolkit";
import styled from "@emotion/styled";
import { Type, Member } from "@wso2/ballerina-core";
import { IdentifierField } from "./IdentifierField";
import { duplicateNames, useRowKeys } from "./TypeUtil";

namespace S {
    export const Container = styled.div`
        display: flex;
        flex-direction: column;
    `;

    export const MemberRow = styled.div`
        display: flex;
        gap: 8px;
        justify-content: flex-start;
        margin-bottom: 8px;
    `;

    export const Header = styled.div`
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        padding: 8px 0px;
        margin-bottom: 8px;
    `;

    export const SectionTitle = styled.div`
        font-size: 13px;
        font-weight: 500;
        color: var(--vscode-editor-foreground);
        margin-bottom: 4px;
    `;

    export const AddButton = styled(Button)`
        margin-top: 8px;
    `;

    export const DeleteButton = styled(Button)`
        min-width: 32px;
        height: 32px;
        padding: 0;
    `;

    export const ExpandIconButton = styled(Button)`
        padding: 4px;
        &:hover {
            background: transparent;
        }
    `;

    export const ConstantExpressionContainer = styled.div`
        display: flex;
        flex-direction: column;
        gap: 8px;
        border: 1px solid var(--vscode-welcomePage-tileBorder);
        margin-left: 25px;
        margin-bottom: 10px;
        padding: 8px;
        border-radius: 4px;
    `;

    export const ValidationMessage = styled.div`
        color: var(--vscode-errorForeground);
        font-size: 12px;
        margin-top: 8px;
    `;
}

interface EnumEditorProps {
    type: Type;
    onChange: (type: Type) => void;
    onValidationError?: (isError: boolean) => void;
}

export function EnumEditor({ type, onChange, onValidationError }: EnumEditorProps) {
    const [expandedMembers, setExpandedMembers] = useState<string[]>([]);
    const [notEnoughMembers, setNotEnoughMembers] = useState<boolean>(false);
    const [fieldValidationErrors, setFieldValidationErrors] = useState<Record<string, boolean>>({});
    const { keys, remove } = useRowKeys(type.members?.length ?? 0);
    // Only a member the user just added takes focus.
    const [focusKey, setFocusKey] = useState<string>();
    const duplicates = duplicateNames((type.members ?? []).map((member) => member.name));
    const hasAnyError = notEnoughMembers || duplicates.length > 0 || keys.some((key) => fieldValidationErrors[key]);
    useEffect(() => {
        onValidationError?.(hasAnyError);
    }, [hasAnyError]);

    // Initialize with at least one member if none exist
    useEffect(() => {
        let shouldUpdateType = false;
        let updatedMembers: Member[] = [...(type.members || [])];

        if (!type.members || type.members.length < 1) {
            shouldUpdateType = true;

            updatedMembers.push({
                kind: "ENUM_MEMBER",
                name: "",
                type: "string",
                refs: []
            });
        }

        setNotEnoughMembers(updatedMembers.length < 1);

        // Only update the type if we made changes
        if (shouldUpdateType) {
            onChange({
                ...type,
                members: updatedMembers
            });
        }
    }, [type.members?.length]);

    // Validate that there is at least one member
    const validateMemberCount = (count: number) => {
        setNotEnoughMembers(count < 1);
    };

    const onFieldValidation = (key: string, hasError: boolean) => {
        setFieldValidationErrors(prev => (!!prev[key] === hasError ? prev : { ...prev, [key]: hasError }));
    };

    const toggleMemberExpand = (key: string) => {
        setExpandedMembers(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
    };

    const addMember = () => {
        const newMember: Member = {
            kind: "ENUM_MEMBER",
            name: "",
            type: "string",
            refs: []
        };

        const updatedMembers = [...type.members, newMember];
        setFocusKey(`added-${updatedMembers.length}`);
        onChange({
            ...type,
            members: updatedMembers
        });

        validateMemberCount(updatedMembers.length);
    };

    const updateMember = (index: number, name: string) => {
        const updatedMembers = [...type.members];
        updatedMembers[index] = {
            ...updatedMembers[index],
            name
        };

        onChange({
            ...type,
            members: updatedMembers
        });
    };

    const deleteMember = (index: number) => {
        const key = keys[index];
        remove(index);
        setFieldValidationErrors(({ [key]: _removed, ...rest }) => rest);
        const updatedMembers = type.members.filter((_, i) => i !== index);
        onChange({
            ...type,
            members: updatedMembers
        });

        validateMemberCount(updatedMembers.length);
    };

    const handleMemberDefaultValueChange = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
        const updatedMembers = [...type.members];
        updatedMembers[index] = {
            ...updatedMembers[index],
            defaultValue: e.target.value
        };

        onChange({
            ...type,
            members: updatedMembers
        });
    };


    return (
        <S.Container>
            <S.Header>
                <S.SectionTitle>Members</S.SectionTitle>
                <div style={{ display: 'flex', gap: '8px' }} data-testid="add-member-button">
                    <Button appearance="icon" onClick={addMember} tooltip='Add Member'>
                        <Codicon name="add" />
                    </Button>
                </div>
            </S.Header>
            {type.members.map((member, index) => (
                <React.Fragment key={keys[index]}>
                    <S.MemberRow>
                        <S.ExpandIconButton
                            appearance="icon"
                            onClick={() => toggleMemberExpand(keys[index])}
                            tooltip={expandedMembers.includes(keys[index]) ? "Hide Value" : "Show Value"}
                        >
                            <Codicon name={expandedMembers.includes(keys[index]) ? "chevron-down" : "chevron-right"} />
                        </S.ExpandIconButton>
                        <div style={{ flexGrow: 1 }}>
                            <IdentifierField
                                value={member.name}
                                onChange={(value) => updateMember(index, value)}
                                placeholder="Member Name"
                                rootType={type}
                                autoFocus={focusKey === `added-${index + 1}`}
                                onValidationError={(hasError) => onFieldValidation(keys[index], hasError)}
                            />
                        </div>
                        <Button
                            appearance="icon"
                            data-testid={`delete-member-${index}`}
                            onClick={() => deleteMember(index)}
                            disabled={type.members.length <= 1}
                            tooltip={type.members.length <= 1 ? "An enum needs at least one member." : "Delete Member"}

                        >
                            <Codicon
                                name="trash"
                                sx={{
                                    cursor: type.members.length <= 1 ? "not-allowed" : "pointer"
                                }}
                            />
                        </Button>
                    </S.MemberRow>
                    {expandedMembers.includes(keys[index]) && (
                        <S.ConstantExpressionContainer>
                            <TextField
                                label='Value'
                                value={member.defaultValue}
                                onChange={(e) => handleMemberDefaultValueChange(index, e)}
                                style={{ width: '180px' }}
                            />
                        </S.ConstantExpressionContainer>
                    )}
                </React.Fragment>
            ))}
            {duplicates.length > 0 && (
                <S.ValidationMessage>Member names must be unique: {duplicates.join(", ")}</S.ValidationMessage>
            )}
            {notEnoughMembers && type.members.length < 1 && (
                <S.ValidationMessage>
                    Enum type must have at least one member
                </S.ValidationMessage>
            )}
        </S.Container>
    );
} 
