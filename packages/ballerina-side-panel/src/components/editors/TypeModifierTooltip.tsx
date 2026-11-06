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

import React from "react";
import styled from "@emotion/styled";
import type { TypeModifier } from "./typeModifiers";

/** What a modifier means and the syntax it writes, for the tooltip of any control that toggles it. */
export const TYPE_MODIFIER_INFO: Record<TypeModifier, { title: string; description: string; example: string }> = {
    list: {
        title: "List",
        description: "Holds a list of values instead of a single one.",
        example: "string[]",
    },
    nullable: {
        title: "Nullable",
        description: "The value can be nil.",
        example: "string?",
    },
    error: {
        title: "Returns error",
        description: "Can produce an error in place of the value.",
        example: "string|error",
    },
};

/**
 * What a GraphQL non-null toggle tells the user, in GraphQL's words: GraphQL reads a type the other way round from
 * Ballerina, so a Ballerina `T` is the non-null `T!` and a `T?` is the nullable `T`. A description the LS states for
 * the current choice is used in place of the default one.
 */
export function getGraphQLNonNullInfo(nonNull: boolean, stated?: string): { title: string; description: string } {
    return nonNull
        ? { title: "Non-null (!)", description: `${stated ?? "The value is never null"}. Turn off to allow null.` }
        : { title: "Nullable", description: `${stated ?? "The value can be null"}. Turn on to make it non-null (!).` };
}

const TooltipBody = styled.div`
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-width: 240px;
    font-size: 12px;
`;

const TooltipTitle = styled.span`
    font-weight: 600;
`;

const TooltipExample = styled.code`
    font-family: var(--vscode-editor-font-family);
    color: var(--vscode-textPreformat-foreground);
`;

/**
 * The tooltip of a modifier toggle: what it means, and an example of the syntax it writes. The example is labelled as
 * one, as its `string` is not the type the user has in the field.
 */
export function TypeModifierTooltip(props: { title: string; description: string; example?: string }) {
    const { title, description, example } = props;
    return (
        <TooltipBody>
            <TooltipTitle>{title}</TooltipTitle>
            <span>{description}</span>
            {example && <span>Example: <TooltipExample>{example}</TooltipExample></span>}
        </TooltipBody>
    );
}
