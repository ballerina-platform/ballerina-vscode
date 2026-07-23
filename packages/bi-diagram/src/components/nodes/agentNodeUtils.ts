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

import { keyframes } from "@emotion/react";
import { AgentData } from "../../utils/types";

export const getSyncPulseAnimation = (color: string) => keyframes`
    0% { filter: drop-shadow(0 0 2px color-mix(in srgb, ${color} 30%, transparent)); }
    100% { filter: drop-shadow(0 0 8px color-mix(in srgb, ${color} 60%, transparent)) drop-shadow(0 0 12px color-mix(in srgb, ${color} 30%, transparent)); }
`;

export const getBoxSyncPulseAnimation = (color: string) => keyframes`
    0% { box-shadow: 0 0 3px color-mix(in srgb, ${color} 20%, transparent); }
    100% { box-shadow: 0 0 10px color-mix(in srgb, ${color} 50%, transparent), 0 0 20px color-mix(in srgb, ${color} 20%, transparent); }
`;

export const flowDashAnimation = keyframes`
    to { stroke-dashoffset: -12; }
`;

export function sanitizeId(name: string): string {
    return name.replace(/[^A-Za-z0-9_-]/g, "_");
}

export function stripWrappingQuotes(str: string): string {
    if (str.startsWith('string `') && str.endsWith('`')) {
        return str.slice('string `'.length, -1);
    }
    if (
        ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'")))
        && !(str.startsWith('""') || str.startsWith("''"))
    ) {
        return str.slice(1, -1);
    }
    return str;
}

export function sanitizeAgentData(data: AgentData): AgentData {
    return {
        ...data,
        role: data.role ? stripWrappingQuotes(data.role) : data.role,
        instructions: data.instructions ? stripWrappingQuotes(data.instructions) : data.instructions,
    };
}
