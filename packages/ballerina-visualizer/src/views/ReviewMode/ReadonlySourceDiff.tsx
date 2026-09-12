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

import styled from "@emotion/styled";
import { ChangeTypeEnum } from "@wso2/ballerina-core";
import { ReviewViewMode } from "./ReadonlyFlowDiagram";

const Container = styled.div`
    height: 100%;
    overflow: auto;
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    box-sizing: border-box;
`;

const PanelTitle = styled.div`
    font-size: 12px;
    font-weight: 600;
    color: var(--vscode-descriptionForeground);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 6px;
`;

const SourceBlock = styled.pre<{ variant: "old" | "new" | "plain" }>`
    margin: 0;
    padding: 12px 16px;
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: var(--vscode-editor-font-size, 13px);
    white-space: pre-wrap;
    word-break: break-word;
    border-radius: 4px;
    border: 1px solid
        ${(props: { variant: "old" | "new" | "plain" }) =>
            props.variant === "old"
                ? "var(--vscode-inputValidation-errorBorder, var(--vscode-charts-red))"
                : props.variant === "new"
                ? "var(--vscode-gitDecoration-addedResourceForeground, var(--vscode-charts-green))"
                : "var(--vscode-panel-border)"};
    background: var(--vscode-editor-background);
    color: var(--vscode-editor-foreground);
`;

const EmptyNote = styled.div`
    color: var(--vscode-descriptionForeground);
    font-size: 13px;
    font-style: italic;
`;

export interface ReadonlySourceDiffProps {
    oldSource?: string;
    newSource?: string;
    changeType: number;
    viewMode: ReviewViewMode;
}

/**
 * Renders a construct change that has no diagram representation (constants, module
 * variables, listeners, classes, enums, imports) as before/after source blocks. The
 * before/after text travels inside the SemanticDiff metadata, so no extra fetch is
 * needed — this view cannot fail asynchronously.
 */
export function ReadonlySourceDiff(props: ReadonlySourceDiffProps): JSX.Element {
    const { oldSource, newSource, changeType, viewMode } = props;

    const showOld = viewMode !== "new" && oldSource !== undefined;
    const showNew = viewMode !== "old" && newSource !== undefined;

    if (!showOld && !showNew) {
        const missing =
            viewMode === "old"
                ? changeType === ChangeTypeEnum.ADDITION
                    ? "This element was added — there is no previous version."
                    : "The previous version of this element is unavailable."
                : changeType === ChangeTypeEnum.DELETION
                ? "This element was deleted — there is no new version."
                : "The new version of this element is unavailable.";
        return (
            <Container>
                <EmptyNote>{missing}</EmptyNote>
            </Container>
        );
    }

    return (
        <Container>
            {showOld && (
                <div>
                    <PanelTitle>{changeType === ChangeTypeEnum.DELETION ? "Removed" : "Before"}</PanelTitle>
                    <SourceBlock variant={showNew ? "old" : "plain"}>{oldSource}</SourceBlock>
                </div>
            )}
            {showNew && (
                <div>
                    <PanelTitle>{changeType === ChangeTypeEnum.ADDITION ? "Added" : "After"}</PanelTitle>
                    <SourceBlock variant={showOld ? "new" : "plain"}>{newSource}</SourceBlock>
                </div>
            )}
        </Container>
    );
}
