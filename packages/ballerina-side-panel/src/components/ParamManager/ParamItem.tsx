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
// tslint:disable: jsx-no-multiline-js
import React from "react";

import {
    ActionIconWrapper,
    ActionWrapper,
    DeleteIconWrapper,
    EditIconWrapper,
    HeaderLabel,
    ContentWrapper,
    KeyTextWrapper,
    ValueTextWrapper,
    IconWrapper,
    IconTextWrapper,
    TypeWrapper,
    Key
} from "./styles";
import { Parameter } from "./ParamManager";
import { Codicon, Icon } from "@wso2/ui-toolkit";
import { toGraphQLNullability } from "../editors/typeModifiers";

interface ParamItemProps {
    param: Parameter;
    readonly?: boolean;
    /** Shows the type in GraphQL's notation, as a GraphQL argument's type is read in the schema it produces. */
    isGraphql?: boolean;
    onDelete?: (param: Parameter) => void;
    onEditClick?: (param: Parameter) => void;
}

export function ParamItem(props: ParamItemProps) {
    const { param, readonly, isGraphql, onDelete, onEditClick } = props;
    const { formValues, key } = param;

    const writtenType = formValues["type"] || formValues["dataType"] || "";
    const type = isGraphql ? toGraphQLNullability(writtenType) : writtenType;
    const identifier = formValues["variable"] || key;

    let label = key;

    const handleDelete = () => {
        onDelete(param);
    };
    const handleEdit = () => {
        if (!readonly) {
            onEditClick(param);
        }
    };
    const icon = (typeof param.icon === "string") ? <Icon name={param.icon} /> : param.icon;

    return (
        <HeaderLabel data-testid={`${label}-item`}>
            <ContentWrapper readonly={readonly} onClick={handleEdit}>
                {icon ? (
                    <IconTextWrapper>
                        <IconWrapper> {icon} </IconWrapper>
                        <TypeWrapper title={type}> {type} </TypeWrapper>
                    </IconTextWrapper>
                ) : (
                    <KeyTextWrapper>
                        <Key title={type}> {type} </Key>
                    </KeyTextWrapper>
                )}
                <ValueTextWrapper title={identifier}> {identifier} </ValueTextWrapper>
            </ContentWrapper>
            <ActionWrapper>
                {!readonly && (
                    <ActionIconWrapper>
                        <EditIconWrapper>
                            <Codicon name="edit" onClick={handleEdit} />
                        </EditIconWrapper>
                        <DeleteIconWrapper>
                            <Codicon name="trash" onClick={handleDelete} />
                        </DeleteIconWrapper>
                    </ActionIconWrapper>
                )}
            </ActionWrapper>
        </HeaderLabel>
    );
}
