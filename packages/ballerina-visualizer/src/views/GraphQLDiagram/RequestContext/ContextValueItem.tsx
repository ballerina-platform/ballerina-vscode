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
import type { ContextEntry } from "@wso2/ballerina-core";
import { Codicon, Icon } from "@wso2/ui-toolkit";
import {
    ActionIconWrapper,
    ContentSection,
    DeleteIconWrapper,
    EditIconWrapper,
    HeaderLabel,
    IconTextWrapper,
    IconWrapper,
    OptionLabel,
} from "../../BI/ServiceDesigner/styles";
import { SOURCE_OPTIONS } from "./contextEntries";

// The resource form's response rows give this cell 225px; context rows sit in a narrower panel.
const SourceCell = styled(IconTextWrapper)`
    width: 120px;
    flex-shrink: 0;
`;

// The label takes the space left after the actions and shrinks into it, so a long source is cut off with an
// ellipsis instead of running into the edit and delete icons and pushing them out of the row.
const LabelArea = styled.div<{ clickable: boolean }>`
    display: flex;
    align-items: center;
    flex: 1;
    min-width: 0;
    margin-left: 12px;
    cursor: ${(props: { clickable: boolean }) => (props.clickable ? "pointer" : "default")};
`;

const Label = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
`;

const Actions = styled(ActionIconWrapper)`
    flex-shrink: 0;
    margin-left: 8px;
`;

const Content = styled(ContentSection)`
    min-width: 0;
`;

const Key = styled.span`
    flex-shrink: 0;
    color: var(--vscode-editor-foreground);
    font-family: var(--vscode-font-family);
    white-space: nowrap;
`;

const Source = styled.span`
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--vscode-descriptionForeground);
    font-family: var(--vscode-editor-font-family);
    font-size: 12px;
`;

const Required = styled.span`
    flex-shrink: 0;
    font-size: 12px;
    color: var(--vscode-editorHint-foreground, #b0b0b0);
    font-style: italic;
`;

interface ContextValueItemProps {
    entry: ContextEntry;
    readonly?: boolean;
    onEdit: () => void;
    onDelete: () => void;
}

/**
 * One value the request context carries, laid out like the resource form's parameter and response rows: where the
 * value comes from on the left, the key and its source on the right, then edit and delete.
 */
export function ContextValueItem({ entry, readonly, onEdit, onDelete }: ContextValueItemProps) {
    const option = SOURCE_OPTIONS[entry.source];
    const source = entry.source === "expression" ? entry.value : `"${entry.value}"`;
    return (
        <HeaderLabel data-testid={`context-value-${entry.key}`} aria-label={`${entry.key}: ${option.tag} ${source}${entry.required ? ", required" : ""}`}>
            <SourceCell onClick={readonly ? undefined : onEdit}>
                <IconWrapper>
                    {entry.source === "header" || entry.source === "query"
                        ? <Icon name={entry.source} />
                        : <Codicon name={entry.source === "value" ? "symbol-string" : "code"} sx={{ marginTop: -3 }} />}
                </IconWrapper>
                <OptionLabel>{option.tag}</OptionLabel>
            </SourceCell>
            <Content>
                <LabelArea clickable={!readonly} onClick={readonly ? undefined : onEdit}>
                    <Label>
                        <Key>{entry.key}</Key>
                        <Source title={source}>{source}</Source>
                        {entry.required && <Required>required</Required>}
                    </Label>
                </LabelArea>
                {!readonly && (
                    <Actions>
                        <EditIconWrapper title="Edit value">
                            <Codicon name="edit" onClick={onEdit} />
                        </EditIconWrapper>
                        <DeleteIconWrapper title="Delete value">
                            <Codicon name="trash" onClick={onDelete} />
                        </DeleteIconWrapper>
                    </Actions>
                )}
            </Content>
        </HeaderLabel>
    );
}
