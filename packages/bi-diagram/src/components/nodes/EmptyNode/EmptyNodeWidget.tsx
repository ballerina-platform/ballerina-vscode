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
/** @jsxImportSource @emotion/react */
import React, { useState } from "react";
import styled from "@emotion/styled";
import { css, keyframes } from "@emotion/react";
import { DiagramEngine, PortWidget } from "@projectstorm/react-diagrams-core";
import { Popover } from "@wso2/ui-toolkit";
import { EmptyNodeModel } from "./EmptyNodeModel";
import {
    ADD_BUTTON_BG_COLOR,
    ADD_BUTTON_COLOR,
    ADD_BUTTON_DISABLED_COLOR,
    ADD_BUTTON_HOVERED_COLOR,
    EMPTY_NODE_ACTIVE_BG_COLOR,
    EMPTY_NODE_ACTIVE_BORDER_COLOR,
    EMPTY_NODE_WIDTH,
    NODE_PADDING,
} from "../../../resources/constants";
import { useDiagramContext } from "../../DiagramContext";
import AddCommentPopup from "../../AddCommentPopup";

namespace S {
    export const Node = styled.div<{ readOnly: boolean }>`
        display: flex;
        justify-content: center;
        align-items: center;
        width: ${EMPTY_NODE_WIDTH}px;
        height: ${EMPTY_NODE_WIDTH}px;
        cursor: ${(props: { readOnly: boolean }) => (props.readOnly ? "default" : "pointer")};
    `;

    export type CircleStyleProp = {
        show: boolean;
        clickable: boolean;
    };
    export const Circle = styled.div<CircleStyleProp>`
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        width: ${(props: CircleStyleProp) => (props.show ? NODE_PADDING : 0)}px;
        height: ${(props: CircleStyleProp) => (props.show ? NODE_PADDING : 0)}px;
        border: 2px solid ${(props: CircleStyleProp) => (props.show ? EMPTY_NODE_ACTIVE_BORDER_COLOR : "transparent")};
        background-color: ${(props: CircleStyleProp) => (props.show ? EMPTY_NODE_ACTIVE_BG_COLOR : "transparent")};
        border-radius: 50%;
        cursor: ${(props: CircleStyleProp) => (props.clickable ? "pointer" : "not-allowed")};
    `;

    export const TopPortWidget = styled(PortWidget)`
        margin-top: -2px;
    `;

    export const BottomPortWidget = styled(PortWidget)`
        margin-bottom: -2px;
    `;
}

const fadeInZoomIn = keyframes`
    0% {
        opacity: 0;
        transform: scale(0.1);
    }
    100% {
        opacity: 1;
        transform: scale(1);
    }
`;

interface EmptyNodeWidgetProps {
    node: EmptyNodeModel;
    engine: DiagramEngine;
}

export function EmptyNodeWidget(props: EmptyNodeWidgetProps) {
    const { node, engine } = props;
    const { onAddNode, onAddNodePrompt, readOnly, isUserAuthenticated } = useDiagramContext();

    const [isHovered, setIsHovered] = useState(false);
    const [isCommentButtonHovered, setIsCommentButtonHovered] = useState(false);
    const [isNodeButtonHovered, setIsNodeButtonHovered] = useState(false);
    const [isPromptButtonHovered, setIsPromptButtonHovered] = useState(false);
    const [commentAnchorEl, setCommentAnchorEl] = useState<HTMLElement | SVGSVGElement>(null);
    const isCommentBoxOpen = Boolean(commentAnchorEl);

    const handleAddNode = () => {
        if (readOnly) {
            return;
        }
        const topNode = node.getTopNode();
        if (!topNode) {
            console.error(">>> EmptyNodeWidget: handleAddNode: top node not found");
            return;
        }
        const target = node.getTarget();
        if (!target) {
            console.error(">>> EmptyNodeWidget: handleAddNode: target not found");
            return;
        }
        onAddNode(topNode, { startLine: target, endLine: target });
    };

    const handleAddPrompt = (event: React.MouseEvent<HTMLElement | SVGSVGElement>) => {
        if (readOnly) {
            return;
        }
        if (!onAddNodePrompt) {
            console.error(">>> EmptyNodeWidget: handleAddPrompt: onAddNodePrompt not found");
            return;
        }
        const topNode = node.getTopNode();
        if (!topNode) {
            console.error(">>> EmptyNodeWidget: handleAddPrompt: top node not found");
            return;
        }
        const target = node.getTarget();
        if (!target) {
            console.error(">>> EmptyNodeWidget: handleAddPrompt: target not found");
            return;
        }
        // Directly open AI Chat with CodeContext instead of showing prompt popup
        onAddNodePrompt(topNode, { startLine: target, endLine: target }, "");
    };

    const handleAddComment = (event: React.MouseEvent<HTMLElement | SVGSVGElement>) => {
        if (readOnly) {
            return;
        }
        setCommentAnchorEl(event.currentTarget);
    };

    const handleCloseCommentBox = () => {
        setCommentAnchorEl(null);
        setIsHovered(false);
    };

    return (
        <S.Node
            readOnly={readOnly}
            onMouseEnter={() => !readOnly && setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <S.Circle show={node.isVisible()} clickable={node.showButton && !readOnly}>
                <S.TopPortWidget port={node.getPort("in")!} engine={engine} />
                {node.showButton && (
                    <div
                        css={css`
                            display: flex;
                            justify-content: center;
                            align-items: center;
                            gap: 5px;
                        `}
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            onClick={handleAddComment}
                            onMouseEnter={() => setIsCommentButtonHovered(true)}
                            onMouseLeave={() => setIsCommentButtonHovered(false)}
                            css={css`
                                display: ${isHovered ? "flex" : "none"};
                                animation: ${fadeInZoomIn} 0.2s ease-out forwards;
                                cursor: pointer;
                            `}
                        >
                            <path
                                fill={ADD_BUTTON_BG_COLOR}
                                d="M12 0C5 0 0 5 0 12s5 12 12 12 12-5 12-12S19 0 12 0z"
                            />
                            <path
                                fill={isCommentButtonHovered ? ADD_BUTTON_HOVERED_COLOR : ADD_BUTTON_COLOR}
                                d="m6 17l-2.15 2.15q-.25.25-.55.125T3 18.8V5q0-.825.588-1.412T5 3h12q.825 0 1.413.588T19 5v4.025q0 .425-.288.7T18 10t-.712-.288T17 9V5H5v10h6q.425 0 .713.288T12 16t-.288.713T11 17zm2-8h6q.425 0 .713-.288T15 8t-.288-.712T14 7H8q-.425 0-.712.288T7 8t.288.713T8 9m0 4h3q.425 0 .713-.288T12 12t-.288-.712T11 11H8q-.425 0-.712.288T7 12t.288.713T8 13m9 4h-2q-.425 0-.712-.288T14 16t.288-.712T15 15h2v-2q0-.425.288-.712T18 12t.713.288T19 13v2h2q.425 0 .713.288T22 16t-.288.713T21 17h-2v2q0 .425-.288.713T18 20t-.712-.288T17 19zM5 15V5z"
                            />
                        </svg>
                        <svg
                            data-testid={`empty-node-add-button-${node.visibleBtnCounter}`}
                            xmlns="http://www.w3.org/2000/svg"
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            onClick={handleAddNode}
                            onMouseEnter={() => !readOnly && setIsNodeButtonHovered(true)}
                            onMouseLeave={() => setIsNodeButtonHovered(false)}
                            // css={css`
                            //     cursor: pointer;
                            // `}
                        >
                            <path
                                fill={ADD_BUTTON_BG_COLOR}
                                d="M12 0C5 0 0 5 0 12s5 12 12 12 12-5 12-12S19 0 12 0z"
                            />
                            <path
                                fill={isNodeButtonHovered ? ADD_BUTTON_HOVERED_COLOR : ADD_BUTTON_COLOR}
                                d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2m0 18a8 8 0 1 1 8-8a8 8 0 0 1-8 8m4-9h-3V8a1 1 0 0 0-2 0v3H8a1 1 0 0 0 0 2h3v3a1 1 0 0 0 2 0v-3h3a1 1 0 0 0 0-2"
                            />
                        </svg>
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            onClick={isUserAuthenticated ? handleAddPrompt : undefined}
                            onMouseEnter={() => setIsPromptButtonHovered(true)}
                            onMouseLeave={() => setIsPromptButtonHovered(false)}
                            css={css`
                                display: ${isHovered ? "flex" : "none"};
                                animation: ${fadeInZoomIn} 0.2s ease-out forwards;
                                cursor: ${isUserAuthenticated ? "pointer" : "not-allowed"};
                            `}
                        >
                            {!isUserAuthenticated && <title>You need to be logged into WSO2 Integrator Copilot to access AI features</title>}
                            <path
                                fill={ADD_BUTTON_BG_COLOR}
                                d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"
                            />
                            <path
                                fill={!isUserAuthenticated ? ADD_BUTTON_DISABLED_COLOR : (isPromptButtonHovered ? ADD_BUTTON_HOVERED_COLOR : ADD_BUTTON_COLOR)}
                                d="M7.5 5.6L5 7l1.4-2.5L5 2l2.5 1.4L10 2L8.6 4.5L10 7zm12 9.8L22 14l-1.4 2.5L22 19l-2.5-1.4L17 19l1.4-2.5L17 14zM22 2l-1.4 2.5L22 7l-2.5-1.4L17 7l1.4-2.5L17 2l2.5 1.4zm-8.66 10.78l2.44-2.44l-2.12-2.12l-2.44 2.44zm1.03-5.49l2.34 2.34c.39.37.39 1.02 0 1.41L5.04 22.71c-.39.39-1.04.39-1.41 0l-2.34-2.34c-.39-.37-.39-1.02 0-1.41L12.96 7.29c.39-.39 1.04-.39 1.41 0"
                            />
                        </svg>
                    </div>
                )}
                {isCommentBoxOpen && (
                    <foreignObject>
                        <Popover
                            open={isCommentBoxOpen}
                            anchorEl={commentAnchorEl}
                            sx={{
                                padding: 0,
                                borderRadius: 0,
                                backgroundColor: "unset",
                            }}
                        >
                            <AddCommentPopup target={node.getTarget()} onClose={handleCloseCommentBox} />
                        </Popover>
                    </foreignObject>
                )}
                <S.BottomPortWidget port={node.getPort("out")!} engine={engine} />
            </S.Circle>
        </S.Node>
    );
}
