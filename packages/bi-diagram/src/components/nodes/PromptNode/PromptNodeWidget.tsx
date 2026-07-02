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

import React, { useEffect, useMemo, useRef, useState } from "react";
import styled from "@emotion/styled";
import { DiagramEngine, PortWidget } from "@projectstorm/react-diagrams-core";
import {
    DRAFT_NODE_BORDER_WIDTH,
    LABEL_HEIGHT,
    LABEL_WIDTH,
    NODE_BG_BREAKPOINT_COLOR,
    NODE_BG_COLOR,
    NODE_BORDER_COLOR,
    NODE_BORDER_ERROR_COLOR,
    NODE_BORDER_SELECTED_COLOR,
    NODE_BORDER_WIDTH,
    NODE_ERROR_COLOR,
    NODE_GAP_X,
    NODE_HEIGHT,
    NODE_PADDING,
    NODE_TEXT_COLOR,
    PANEL_BG_COLOR,
    PROMPT_NODE_HEIGHT,
    PROMPT_NODE_WIDTH,
} from "../../../resources/constants";
import { Button, Icon, Item, getAIModuleIcon, DefaultLlmIcon } from "@wso2/ui-toolkit";
import { NPPromptEditor } from "../../editors/NPPromptEditor";
import { InputMode } from "@wso2/ballerina-side-panel";
import NodeIcon from "../../NodeIcon";
import { useDiagramContext } from "../../DiagramContext";
import { PromptNodeModel } from "./PromptNodeModel";
import { ELineRange, ExpressionProperty, NodeMetadata } from "@wso2/ballerina-core";
import { DiagnosticsPopUp } from "../../DiagnosticsPopUp";
import { nodeHasError } from "../../../utils/node";
import { cloneDeep } from "lodash";

export namespace NodeStyles {
    export type NodeStyleProp = {
        disabled: boolean;
        hovered: boolean;
        hasError: boolean;
        isActiveBreakpoint?: boolean;
        isSelected?: boolean;
    };
    export const Node = styled.div<NodeStyleProp>`
        display: flex;
        flex-direction: column;
        justify-content: flex-start;
        align-items: center;
        width: ${PROMPT_NODE_WIDTH}px;
        min-height: ${PROMPT_NODE_HEIGHT}px;
        padding: ${NODE_PADDING}px;
        background-color: ${(props: NodeStyleProp) =>
            props?.isActiveBreakpoint ? NODE_BG_BREAKPOINT_COLOR : NODE_BG_COLOR};
        color: ${NODE_TEXT_COLOR};
        opacity: ${(props: NodeStyleProp) => (props.disabled ? 0.7 : 1)};
        border: ${(props: NodeStyleProp) => (props.disabled ? DRAFT_NODE_BORDER_WIDTH : NODE_BORDER_WIDTH)}px;
        border-style: ${(props: NodeStyleProp) => (props.disabled ? "dashed" : "solid")};
        border-color: ${(props: NodeStyleProp) =>
            props.hasError
                ? NODE_BORDER_ERROR_COLOR
                : props.isSelected && !props.disabled
                    ? NODE_BORDER_SELECTED_COLOR
                    : props.hovered && !props.disabled
                        ? NODE_BORDER_SELECTED_COLOR
                        : NODE_BORDER_COLOR};
        border-radius: 10px;
    `;

    export const Header = styled.div<{}>`
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: flex-start;
        gap: 2px;
        width: 100%;
        padding: 8px;
        cursor: pointer;
    `;

    export const ActionButtonGroup = styled.div`
        display: flex;
        flex-direction: row;
        justify-content: flex-end;
        align-items: center;
        gap: 2px;
    `;

    export const MenuButton = styled(Button)`
        border-radius: 5px;
    `;

    export const ErrorIcon = styled.div`
        font-size: 20px;
        width: 20px;
        height: 20px;
        color: ${NODE_ERROR_COLOR};
    `;

    export const TopPortWidget = styled(PortWidget)`
        margin-top: -3px;
    `;

    export const BottomPortWidget = styled(PortWidget)`
        margin-bottom: -2px;
    `;

    export const StyledText = styled.div`
        font-size: 14px;
    `;

    export const Icon = styled.div`
        padding: 4px;
        svg {
            fill: ${NODE_TEXT_COLOR};
        }
    `;

    export const Title = styled(StyledText)`
        max-width: ${PROMPT_NODE_WIDTH - 80}px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        font-family: "GilmerMedium";
    `;

    export const Description = styled(StyledText)`
        max-width: ${PROMPT_NODE_WIDTH - 80}px;
        overflow: hidden;
        text-overflow: ellipsis;
        font-family: monospace;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        color: ${NODE_TEXT_COLOR};
        opacity: 0.7;
        white-space: normal;
        font-size: 12px;
        line-height: 14px;
        max-height: 28px;
    `;

    export const Row = styled.div`
        display: flex;
        flex-direction: row;
        justify-content: space-between;
        align-items: center;
        width: 100%;
    `;

    export const Body = styled.div`
        display: flex;
        flex-direction: column;
        flex-grow: 1;
        width: 100%;
    `;

    export const ButtonGroup = styled.div`
        display: flex;
        width: 100%;
        justify-content: flex-end;
        align-items: center;
        gap: 8px;
    `;

    export const Editor = styled.div`
        width: 100%;
        flex-grow: 1;
        color: ${NODE_TEXT_COLOR};
        background-color: ${PANEL_BG_COLOR};
        border: 1px solid ${NODE_BORDER_COLOR};
        border-radius: 10px;
        padding: ${NODE_PADDING}px;
        cursor: not-allowed;
    `;

    export const Hr = styled.hr`
        width: 100%;
    `;

    export const Footer = styled(StyledText)`
        display: flex;
        align-items: center;
        gap: 8px;
    `;

    export const StyledCircle = styled.circle`
        cursor: pointer;
        &:hover {
            stroke: ${NODE_BORDER_SELECTED_COLOR};
        }
    `;
}

const FETCH_COMPLETIONS_STATE = {
    IDLE: "IDLE",
    FETCHING: "FETCHING",
    DONE: "DONE"
} as const;

type FetchCompletionsState = typeof FETCH_COMPLETIONS_STATE[keyof typeof FETCH_COMPLETIONS_STATE];

export interface PromptNodeWidgetProps {
    model: PromptNodeModel;
    engine: DiagramEngine;
}

export interface NodeWidgetProps extends Omit<PromptNodeWidgetProps, "children"> { }

export function PromptNodeWidget(props: PromptNodeWidgetProps) {
    const { model, engine } = props;
    const {
        flow,
        project,
        goToSource,
        openView,
        onNodeSave,
        expressionContext,
        aiNodes,
        selectedNodeId,
    } = useDiagramContext();

    const npFunctionNode = useMemo(
        () => flow.nodes.find(node => node.codedata?.node === "NP_FUNCTION"),
        [flow.nodes]
    );

    const isSelected = selectedNodeId === model.node.id;
    const {
        completions,
        triggerCharacters,
        retrieveCompletions,
        onCompletionItemSelect,
        onFocus,
        onBlur,
        onCancel,
        getHelperPane,
        getExpressionTokens
    } = expressionContext;

    const [isHovered, setIsHovered] = useState(false);
    const [editable, setEditable] = useState(false);
    const [bodyTextTemplate, setBodyTextTemplate] = useState("");
    const hasBreakpoint = model.hasBreakpoint();
    const isActiveBreakpoint = model.isActiveBreakpoint();

    const cursorPositionRef = useRef<number | undefined>(undefined);
    const field: ExpressionProperty = useMemo(() => model.node.properties['prompt'], [model]);
    const nodeMetadata = (model.node.properties?.modelProvider?.metadata?.data as NodeMetadata);
    const nodeModelType = nodeMetadata?.type === "ModelProvider" ? nodeMetadata?.module : nodeMetadata?.type;
    const nodeModelIconUrl = (model.node.metadata?.data as NodeMetadata)?.model?.path || (nodeMetadata as any)?.iconUrl;

    const handleOnClick = async (event: React.MouseEvent<HTMLDivElement>) => {
        if (event.metaKey) {
            // Handle action when cmd key is pressed
            onGoToSource();
        }
    };

    const handleSave = () => {
        const clonedNode = cloneDeep(model.node);
        clonedNode.properties['prompt'].value = bodyTextTemplate;
        clonedNode.codedata.node = "NP_FUNCTION_DEFINITION";
        onNodeSave?.(clonedNode);
        toggleEditable();
    };

    const onGoToSource = () => {
        goToSource?.(model.node);
    };

    const openDataMapper = async () => {
        if (!model.node.properties?.view?.value) {
            return;
        }
        const { fileName, startLine, endLine } = model.node.properties.view.value as ELineRange;
        const response = await project?.getProjectPath?.({ segments: [fileName], codeData: model.node.codedata });
        openView &&
            openView({
                documentUri: response.filePath,
                position: {
                    startLine: startLine.line,
                    startColumn: startLine.offset,
                    endLine: endLine.line,
                    endColumn: endLine.offset,
                },
                projectPath: response.projectPath,
            });
    };

    const viewFunction = async () => {
        if (!model.node.properties?.view?.value) {
            return;
        }
        const { fileName, startLine, endLine } = model.node.properties.view.value as ELineRange;
        const response = await project?.getProjectPath?.({ segments: [fileName], codeData: model.node.codedata });
        openView &&
            openView({
                documentUri: response.filePath,
                position: {
                    startLine: startLine.line,
                    startColumn: startLine.offset,
                    endLine: endLine.line,
                    endColumn: endLine.offset,
                },
                projectPath: response.projectPath,
            });
    };

    const toggleEditable = () => {
        if (editable) {
            // Reset to original value when canceling
            const prompt = model.node.properties?.['prompt']?.value as string;
            if (!prompt) {
                handleBodyTextChange("");
            } else {
                const promptWithoutQuotes = prompt.replace(/^`|`$/g, "");
                handleBodyTextChange(promptWithoutQuotes);
            }
        }
        setEditable(!editable);
    };

    const handleBodyTextChange = (value: string) => {
        setBodyTextTemplate(value);
    };

    const menuItems: Item[] = [
        { id: "goToSource", label: "Source", onClick: () => onGoToSource() },
    ];

    if (model.node.codedata.node === "DATA_MAPPER_DEFINITION") {
        menuItems.splice(1, 0, {
            id: "openDataMapper",
            label: "View",
            onClick: () => {
                openDataMapper();
            },
        });
    }

    if (model.node.codedata.node === "FUNCTION_CALL") {
        menuItems.splice(1, 0, {
            id: "viewFunction",
            label: "View",
            onClick: () => {
                viewFunction();
            },
        });
    }

    const hasError = nodeHasError(model.node);

    useEffect(() => {
        const prompt = model.node.properties?.['prompt']?.value as string;
        if (!prompt) {
            handleBodyTextChange("");
        } else {
            const promptWithoutQuotes = prompt.replace(/^`|`$/g, "");
            handleBodyTextChange(promptWithoutQuotes);
        }
    }, [model.node.properties]);

    const handleChange = async (newValue: string, updatedCursorPosition: number) => {
        handleBodyTextChange(newValue);
        cursorPositionRef.current = updatedCursorPosition;

        // Check if the current character is a trigger character
        const triggerCharacter =
            updatedCursorPosition > 0
                ? triggerCharacters.find((char) => newValue[updatedCursorPosition - 1] === char)
                : undefined;

        try {
            if (triggerCharacter) {
                await retrieveCompletions(
                    newValue,
                    field,
                    updatedCursorPosition + 1,
                    triggerCharacter
                );
            } else {
                await retrieveCompletions(
                    newValue,
                    field,
                    updatedCursorPosition + 1,
                );
            }
        } catch (error) {
            console.error('Failed to retrieve completions:', error);
        }
    }

    const onModelEditClick = () => {
        aiNodes?.onModelSelect(model.node);
    };


    return (
        <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-start' }}>
            <NodeStyles.Node
                hovered={isHovered}
                disabled={model.node.suggested}
                hasError={hasError}
                isActiveBreakpoint={isActiveBreakpoint}
                isSelected={isSelected}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
            >
                {hasBreakpoint && (
                    <div
                        data-testid={isActiveBreakpoint ? "breakpoint-indicator-diagram-active" : "breakpoint-indicator-diagram"}
                        style={{
                            position: "absolute",
                            left: -5,
                            width: 15,
                            height: 15,
                            borderRadius: "50%",
                            backgroundColor: "red",
                        }}
                    />
                )}
                <NodeStyles.TopPortWidget port={model.getPort("in")!} engine={engine} />
                <NodeStyles.Row>
                    <NodeStyles.Icon onClick={handleOnClick}>
                        <NodeIcon type={model.node.codedata.node} size={24} />
                    </NodeStyles.Icon>
                    <NodeStyles.Row>
                        <NodeStyles.Header onClick={handleOnClick}>
                            <NodeStyles.Title>Prompt</NodeStyles.Title>
                        </NodeStyles.Header>
                        <NodeStyles.ActionButtonGroup>
                            {hasError && <DiagnosticsPopUp node={model.node} engine={engine} />}
                        </NodeStyles.ActionButtonGroup>
                    </NodeStyles.Row>
                    {!editable && (
                        <NodeStyles.Icon title="Edit Prompt">
                            <Icon
                                name="bi-edit"
                                onClick={toggleEditable}
                                sx={{
                                    fontSize: 20,
                                    width: 20,
                                    height: 20
                                }}
                            />
                        </NodeStyles.Icon>
                    )}
                </NodeStyles.Row>
                <NodeStyles.Body>
                    <NPPromptEditor
                        node={npFunctionNode}
                        fileName={flow.fileName || model.node.codedata?.lineRange.fileName}
                        targetLineRange={npFunctionNode?.properties['prompt']?.codedata?.lineRange}
                        value={bodyTextTemplate}
                        onChange={handleChange}
                        placeholder="Enter your prompt here..."
                        completions={completions}
                        triggerCharacters={triggerCharacters}
                        retrieveCompletions={retrieveCompletions}
                        onCompletionItemSelect={onCompletionItemSelect}
                        onFocus={onFocus}
                        onBlur={onBlur}
                        onCancel={onCancel}
                        getHelperPane={getHelperPane}
                        getExpressionTokens={getExpressionTokens}
                        inputMode={InputMode.PROMPT}
                        sx={{ width: '100%', height: '100%' }}
                        disabled={!editable}
                    />
                </NodeStyles.Body>

                {editable && (
                    <NodeStyles.ButtonGroup>
                        <Button appearance="secondary" onClick={toggleEditable}>
                            Cancel
                        </Button>
                        <Button appearance="primary" onClick={handleSave}>
                            Save
                        </Button>
                    </NodeStyles.ButtonGroup>
                )}
                <NodeStyles.BottomPortWidget port={model.getPort("out")!} engine={engine} />
            </NodeStyles.Node>

            <svg
                width={NODE_GAP_X + NODE_HEIGHT + LABEL_HEIGHT + LABEL_WIDTH + 10}
                height={PROMPT_NODE_HEIGHT}
                viewBox={`0 0 300 ${PROMPT_NODE_HEIGHT}`}
                style={{ marginLeft: "-10px" }}
            >
                {/* NP function model circle */}
                <title>{"Configure Model Provider"}</title>
                <g>
                    <NodeStyles.StyledCircle
                        cx="80"
                        cy="24"
                        r="22"
                        fill={NODE_BG_COLOR}
                        stroke={NODE_BORDER_COLOR}
                        strokeWidth={1.5}
                        strokeDasharray={model.node.suggested ? "5 5" : "none"}
                        opacity={model.node.suggested ? 0.7 : 1}
                        onClick={onModelEditClick}
                    />
                    <foreignObject
                        x="68"
                        y="12"
                        width="44"
                        height="44"
                        fill={NODE_TEXT_COLOR}
                        style={{ pointerEvents: "none" }}
                    >
                        {getAIModuleIcon(nodeModelType) ?? (nodeModelIconUrl ? <img src={nodeModelIconUrl} style={{ width: 24, height: 24 }} /> : <DefaultLlmIcon />)}
                    </foreignObject>
                    <line
                        x1="0"
                        y1="25"
                        x2="57"
                        y2="25"
                        style={{
                            stroke: NODE_TEXT_COLOR,
                            strokeWidth: 1.5,
                            markerEnd: `url(#${model.node.id}-arrow-head)`,
                            markerStart: `url(#${model.node.id}-diamond-start)`,
                        }}
                    />
                </g>

                <defs>
                    <marker
                        id={`${model.node.id}-arrow-head`}
                        markerWidth="4"
                        markerHeight="4"
                        refX="3"
                        refY="2"
                        viewBox="0 0 4 4"
                        orient="auto"
                    >
                        <polygon points="0,4 0,0 4,2" fill={NODE_TEXT_COLOR}></polygon>
                    </marker>
                    <marker
                        id={`${model.node.id}-diamond-start`}
                        markerWidth="8"
                        markerHeight="8"
                        refX="4.5"
                        refY="4"
                        viewBox="0 0 8 8"
                        orient="auto"
                    >
                        <circle
                            cx="4"
                            cy="4"
                            r="3"
                            fill={NODE_BG_COLOR}
                            stroke={NODE_TEXT_COLOR}
                            strokeWidth="1"
                        />
                    </marker>
                </defs>
            </svg>
        </div>
    );
}

function isExpression(value: string, cursorPosition: number) {
    let suffixMatch: boolean = false;
    let prefixMatch: boolean = false;

    if (cursorPosition === 0) {
        return false;
    }

    for (let i = cursorPosition; i < value.length; i++) {
        const index = i;
        if (value[index] === "}") {
            console.log("suffixMatch", index);
            suffixMatch = true;
            break;
        } else if (value[index] === "{") {
            break;
        }
    }

    for (let i = cursorPosition; i > 0; i--) {
        const index = i - 1;
        if (value[index] === "{") {
            console.log("prefixMatch", index);
            prefixMatch = true;
            break;
        } else if (value[index] === "}") {
            break;
        }
    }

    return prefixMatch && suffixMatch;
}
