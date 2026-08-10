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

import { NodeMetadata } from "@wso2/ballerina-core";
import { NODE_HEIGHT } from "../../../resources/constants";
import { FlowNode } from "../../../utils/types";

const DEFAULT_MODEL_PROVIDER_EXPR = "check ai:getDefaultModelProvider()";
const AGENT_TYPE = "ai:Agent";
const MODEL_PROVIDER_TYPE = "ai:ModelProvider";

export const ICON_BOX_SIZE = 24;
const JUDGE_ICON = { name: "law", size: 24 };
const ASSERTION_ICON = { name: "beaker", size: 20 };

export const HEADER_PADDING_Y = 8;
export const HEADER_MARGIN_TOP = 2;
export const TITLE_HEIGHT = 18;
export const TITLE_SUBTITLE_GAP = 2;
export const SUBTITLE_MARGIN_TOP = -4;
export const SUBTITLE_LINE_HEIGHT = 16;

const DIVIDER_HEIGHT = 1;
export const DESCRIPTION_LINES = 3;
export const DESCRIPTION_LINE_HEIGHT = 16;
export const DESCRIPTION_HEIGHT = DESCRIPTION_LINE_HEIGHT * DESCRIPTION_LINES;
export const DESCRIPTION_MARGIN_Y = 12;

export const ROLE_ROW_HEIGHT = 36;
export const ROLE_ROW_GAP = 6;
export const ROLE_SUMMARY_PADDING = 8;
export const ROLE_SUMMARY_MARGIN_BOTTOM = 8;

const HEADER_CONTENT_HEIGHT =
    TITLE_HEIGHT + TITLE_SUBTITLE_GAP + SUBTITLE_MARGIN_TOP + SUBTITLE_LINE_HEIGHT;
const HEADER_HEIGHT = HEADER_MARGIN_TOP + HEADER_PADDING_Y * 2 + HEADER_CONTENT_HEIGHT;
const DESCRIPTION_BLOCK_HEIGHT =
    DIVIDER_HEIGHT + DESCRIPTION_MARGIN_Y * 2 + DESCRIPTION_HEIGHT;
const roleSummaryHeight = (roleCount: number) => roleCount > 0
    ? ROLE_SUMMARY_PADDING * 2 + ROLE_ROW_HEIGHT * roleCount + ROLE_ROW_GAP * (roleCount - 1)
        + ROLE_SUMMARY_MARGIN_BOTTOM + 2
    : 0;

interface EvalPresentation {
    icon: { name: string; size: number };
    subtitle: string;
    description?: string;
    agentName?: string;
    judgeModel?: { label: string; isDefault: boolean; type?: string; iconUrl?: string };
}

function propertyValueByType(node: FlowNode, ballerinaType: string): string {
    const property = Object.values(node.properties ?? {}).find(candidate =>
        (candidate.types ?? []).some(type => String(type.ballerinaType ?? "").includes(ballerinaType)));
    return typeof property?.value === "string" ? property.value.trim() : "";
}

function deriveSubtitle(symbol: string): string {
    const stripped = symbol.replace(/^(evaluate|assert|check)/, "");
    if (!stripped || stripped === symbol) {
        return symbol;
    }
    return stripped.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
}

export function getEvalPresentation(node: FlowNode): EvalPresentation {
    const symbol = node.codedata?.symbol || node.metadata?.label || "Evaluation";
    const modelValue = propertyValueByType(node, MODEL_PROVIDER_TYPE);
    const model = (node.metadata?.data as NodeMetadata | undefined)?.model;

    return {
        icon: modelValue ? JUDGE_ICON : ASSERTION_ICON,
        subtitle: deriveSubtitle(symbol),
        description: node.metadata?.description?.trim() || undefined,
        agentName: propertyValueByType(node, AGENT_TYPE) || undefined,
        judgeModel: modelValue
            ? {
                label: modelValue === DEFAULT_MODEL_PROVIDER_EXPR ? "Default model provider" : modelValue,
                isDefault: modelValue === DEFAULT_MODEL_PROVIDER_EXPR,
                type: model?.type,
                iconUrl: model?.path,
            }
            : undefined,
    };
}

export function getEvalNodeContainerHeight(node: FlowNode): number {
    const { description, agentName, judgeModel } = getEvalPresentation(node);
    return Math.max(
        NODE_HEIGHT,
        HEADER_HEIGHT + (description ? DESCRIPTION_BLOCK_HEIGHT : 0)
            + roleSummaryHeight(Number(Boolean(agentName)) + Number(Boolean(judgeModel)))
    );
}
