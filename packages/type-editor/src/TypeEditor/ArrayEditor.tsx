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

import styled from "@emotion/styled";
import { Imports, Member, Type, TypeProperty } from "@wso2/ballerina-core";
import React, { useRef } from "react";
import { TypeField } from "./TypeField";
import { TextField } from "@wso2/ui-toolkit/lib/components/TextField/TextField";

interface ArrayEditorProps {
    type: Type;
    onChange: (type: Type) => void;
    onValidationError: (isError: boolean) => void;
}

namespace S {
    export const Container = styled.div`
        display: flex;
        flex-direction: column;
    `;

    export const MemberRow = styled.div`
        display: flex;
        gap: 8px;
        justify-content: space-between;
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

    export const Fields = styled.div`
        display: flex;
        gap: 15px;
        margin-bottom: 8px;
        flex-direction: column;
        flex-grow: 1;
    `;
}
export function ArrayEditor(props: ArrayEditorProps) {
    const currentImports = useRef<Imports | undefined>();
    
    const newMember: Member = {
        kind: "TYPE",
        type: "",
        refs: [],
        name: ""
    };

    const defaultSizeProperty: TypeProperty = {
        metadata: {
            label: "Size",
            description: "Array dimensions"
        },
        valueType: "STRING",
        value: "",
        optional: true,
        editable: true,
        advanced: false
    }

    const member = props.type?.members?.length > 0 ? props.type.members[0] : newMember;
    const sizeProperty = props.type.properties?.arraySize ?? defaultSizeProperty;

    const updateMember = (newType: string) => {
        props.onChange({
            ...props.type,
            members: [{ ...member, type: newType, imports: currentImports.current }]
        });
        currentImports.current = undefined;
    };

    const handleUpdateImports = (imports: Imports) => {
        const newImportKey = Object.keys(imports)[0];
        if (!member.imports || !Object.keys(member.imports)?.includes(newImportKey)) {
            const updatedImports = { ...member.imports, ...imports };
            currentImports.current = updatedImports;
        }
    };

    const updateSize = (newSize: string) => {
        props.onChange({
            ...props.type,
            properties: {
                ...props.type.properties,
                arraySize: {
                    ...sizeProperty,
                    value: newSize
                }
            }
        });
    };

    return (
        <S.Container>
            <S.Header>
                <S.Fields>
                    <TypeField
                        fieldIndex={0}
                        type={member.type}
                        memberName={typeof member.type === 'string' ? member.type : member.name}
                        onChange={(newType) => updateMember(newType)}
                        onUpdateImports={(imports) => handleUpdateImports(imports)}
                        placeholder="Type"
                        sx={{ flexGrow: 1 }}
                        label="Element Type"
                        required={true}
                        autoFocus={true}
                        onValidationError={props.onValidationError}
                        rootType={props.type}
                    />
                    <TextField
                        label="Size"
                        value={sizeProperty.value}
                        sx={{ flexGrow: 1 }}
                        onChange={(e) => updateSize(e.target.value)}
                    />
                </S.Fields>
            </S.Header>
        </S.Container>
    );
}
