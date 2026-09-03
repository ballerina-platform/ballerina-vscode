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
import React from "react";
import { css } from "@emotion/react";
import { Icon, ThemeColors, Tooltip } from "@wso2/ui-toolkit";

interface ApprovalBadgeProps {
    background: string;
}

/**
 * A shield badge on the tool's top-right corner shown when the tool's
 * @ai:AgentTool annotation gates it for human-in-the-loop approval.
 */
export function ApprovalBadge({ background }: ApprovalBadgeProps) {
    return (
        // Positioned on the 45° point of the tool circle (cx=80 cy=24 r=22, shared by
        // AgentNodeWidget and AgentCallNodeWidget). If that circle's geometry changes in
        // either widget, these coordinates need to move with it.
        <foreignObject x="88.5" y="-0.5" width="17" height="17" style={{ overflow: "visible" }}>
            <Tooltip content="Requires Approval" containerSx={{ display: "flex" }}>
                <div
                    css={css`
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        width: 17px;
                        height: 17px;
                        border-radius: 50%;
                        box-sizing: border-box;
                        background: ${background};
                        border: 1.5px solid ${ThemeColors.SECONDARY};
                        color: ${ThemeColors.SECONDARY};
                    `}
                >
                    <Icon name="user-fill" sx={{ fontSize: 11, width: 11, height: 11 }} iconSx={{ fontSize: "11px" }} />
                </div>
            </Tooltip>
        </foreignObject>
    );
}
