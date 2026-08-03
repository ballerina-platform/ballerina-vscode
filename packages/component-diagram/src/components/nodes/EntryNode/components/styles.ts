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
import { PortWidget } from "@projectstorm/react-diagrams-core";
import { Button, ThemeColors } from "@wso2/ui-toolkit";
import { NODE_BORDER_WIDTH, ENTRY_NODE_WIDTH, ENTRY_NODE_HEIGHT } from "../../../../resources/constants";

type NodeStyleProp = {
    hovered: boolean;
    inactive?: boolean;
};

export const Node = styled.div`
    display: flex;
    flex-direction: row;
    justify-content: center;
    align-items: center;
    color: ${ThemeColors.ON_SURFACE};
`;

export const Header = styled.div<NodeStyleProp>`
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: flex-start;
    gap: 6px;
    width: 100%;
    cursor: ${(props: NodeStyleProp) => props.inactive ? "default" : "pointer"};
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

export const IconWrapper = styled.div`
    padding: 4px;
    max-width: 32px;
    svg {
        fill: ${ThemeColors.ON_SURFACE};
    }
    > div:first-child {
        width: 24px;
        height: 24px;
        font-size: 24px;
    }
`;

export const Title = styled(StyledText) <NodeStyleProp>`
    max-width: ${ENTRY_NODE_WIDTH - 80}px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-family: "GilmerMedium";
    color: ${(props: NodeStyleProp) => (props.hovered ? ThemeColors.HIGHLIGHT : ThemeColors.ON_SURFACE)};
    opacity: ${(props: NodeStyleProp) => (props.inactive && !props.hovered ? 0.7 : 1)};
`;

export const ResourceAccessor = styled(StyledText) <{ color?: string }>`
    text-transform: uppercase;
    font-family: "GilmerBold";
    background-color: ${(props) => props.color};
    color: #FFF;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 12px;
    justify-content: center;
    min-width: 60px;
    text-align: center;
    align-items: center;
    font-weight: bold;
`;

export const Description = styled(StyledText)`
    font-size: 12px;
    max-width: ${ENTRY_NODE_WIDTH - 80}px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: monospace;
    color: ${ThemeColors.ON_SURFACE};
    opacity: 0.7;
`;

export const Box = styled.div<NodeStyleProp>`
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    align-items: center;
    gap: 8px;
    width: 100%;
    position: relative;
    border: ${NODE_BORDER_WIDTH}px solid
        ${(props: NodeStyleProp) => (props.hovered ? ThemeColors.HIGHLIGHT : ThemeColors.OUTLINE_VARIANT)};
    border-radius: 8px;
    background-color: ${ThemeColors.SURFACE_DIM};
    padding: 8px;
`;

export const ServiceBox = styled.div<{ readonly?: boolean }>`
    display: flex;
    flex-direction: row;
    justify-content: flex-start;
    align-items: center;
    gap: 10px;
    width: ${ENTRY_NODE_WIDTH}px;
    height: ${ENTRY_NODE_HEIGHT - 8}px;
    cursor: ${(props) => props.readonly ? "default" : "pointer"};
    &:hover {
        background-color: ${(props) => !props.readonly ? ThemeColors.PRIMARY_CONTAINER : "transparent"};
        border-radius: 8px;
    }
`;

export const FunctionBoxWrapper = styled.div`
    display: flex;
    flex-direction: row;
    justify-content: center;
    align-items: center;
    color: ${ThemeColors.ON_SURFACE};
`;

export const StyledServiceBox = styled(ServiceBox) <NodeStyleProp>`
    height: 40px;
    padding: 0 12px;
    border: ${NODE_BORDER_WIDTH}px solid
        ${(props: NodeStyleProp) => (props.hovered ? ThemeColors.HIGHLIGHT : ThemeColors.OUTLINE_VARIANT)};
    border-radius: 8px;
    background-color: ${ThemeColors.SURFACE_DIM};
`;

export const EventTypeText = styled(StyledText)`
    margin-left: auto;
    font-size: 12px;
    max-width: 90px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: monospace;
    color: ${ThemeColors.ON_SURFACE};
    opacity: 0.7;
`;

export const PlayButtonCircle = styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
    width: 28px;
    height: 28px;
    position: absolute;
    left: -15px;
    top: 22px;
    border: ${NODE_BORDER_WIDTH}px solid ${ThemeColors.OUTLINE_VARIANT};
    border-radius: 50%;
    background-color: ${ThemeColors.SURFACE_DIM};
    color: ${ThemeColors.ON_SURFACE};
    z-index: 1;
`;

export const PlayButtonPortWrapper = styled.div`
    position: absolute;
    left: 0;
    top: 50%;
`;

export const RowIconWrapper = styled.div`
    display: flex;
    align-items: center;
    svg {
        fill: ${ThemeColors.ON_SURFACE};
    }
    > div:first-child {
        width: 16px;
        height: 16px;
        font-size: 16px;
    }
`;

export const GroupContainer = styled.div<{ accent: string }>`
    display: flex;
    flex-direction: column;
    gap: 6px;
    width: ${ENTRY_NODE_WIDTH}px;
    position: relative;
    border: ${NODE_BORDER_WIDTH}px solid ${ThemeColors.OUTLINE_VARIANT};
    border-radius: 8px;
    background-color: ${ThemeColors.SURFACE_DIM};
    padding: 6px;
`;

export const GroupHeader = styled.div`
    display: flex;
    align-items: center;
    gap: 10px;
    height: 40px;
    padding: 0 6px 0 8px;
    cursor: pointer;
`;

export const MenuButton = styled(Button)`
    border-radius: 5px;
`;

export const ViewAllButton = styled(FunctionBoxWrapper)`
    color: ${ThemeColors.PRIMARY};
    height: 40px;
    width: 100%;
    cursor: pointer;
    font-family: "GilmerMedium";
    font-size: 14px;
    &:hover {
        border: 1px solid ${ThemeColors.HIGHLIGHT};
        border-radius: 8px;
    }
`;

export const ViewAllButtonWrapper = styled.div`
    display: flex;
    flex-direction: row;
    justify-content: center;
    align-items: center;
    width: 100%;
`;

export const CollapseButton = styled(Button)`
    border-radius: 5px;
    padding: 2px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    min-width: 24px;
    color: ${ThemeColors.ON_SURFACE};
    & > div:first-of-type {
        width: 16px;
        height: 16px;
        font-size: 16px;
    }
    svg {
        fill: ${ThemeColors.ON_SURFACE} !important;
    }
    &:hover {
        color: ${ThemeColors.HIGHLIGHT};
    }
    &:hover svg {
        fill: ${ThemeColors.HIGHLIGHT} !important;
    }
`;

export const colors = {
    "GET": '#3d7eff',
    "PUT": '#fca130',
    "POST": '#49cc90',
    "DELETE": '#f93e3e',
    "PATCH": '#986ee2',
    "OPTIONS": '#0d5aa7',
    "HEAD": '#9012fe'
}
