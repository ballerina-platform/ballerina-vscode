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

import React from "react";
import { css, Global } from "@emotion/react";
import styled from "@emotion/styled";
import "../resources/assets/font/fonts.css";
import { useDiagramContext } from "./DiagramContext";
import { CANVAS_BG_COLOR, CANVAS_DOT_COLOR, NODE_TEXT_COLOR } from "../resources/constants";

export interface DiagramCanvasProps {
    color?: string;
    background?: string;
    children?: React.ReactNode;
}

export namespace DiagramStyles {
    export const Container = styled.div<{ color: string; background: string; locked?: boolean }>`
        height: 100%;
        background-size: 50px 50px;
        display: flex;
        overflow: hidden;
        pointer-events: ${(props) => (props.locked ? "none" : "auto")};

        > * {
            height: 100%;
            min-height: 100%;
            width: 100%;
        }

        background-image: radial-gradient(${CANVAS_DOT_COLOR} 10%, transparent 0px);
        background-size: 16px 16px;
        background-color: ${CANVAS_BG_COLOR};
        font-family: "GilmerRegular";
    `;

    export const Expand = css`
        html,
        body,
        #root {
            height: 100%;
        }
    `;
}

export function DiagramCanvas(props: DiagramCanvasProps) {
    const { color, background, children } = props;
    const { lockCanvas } = useDiagramContext();

    return (
        <>
            <Global styles={DiagramStyles.Expand} />
            <DiagramStyles.Container
                id="bi-diagram-canvas"
                data-testid="bi-diagram-canvas"
                background={background || CANVAS_BG_COLOR}
                color={color || NODE_TEXT_COLOR}
                locked={lockCanvas}
            >
                {children}
            </DiagramStyles.Container>
        </>
    );
}
