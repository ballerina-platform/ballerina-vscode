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

import React, { useEffect, useState } from "react";
import styled from "@emotion/styled";
import {
    BombIcon,
    BranchIcon,
    BreakIcon,
    CallIcon,
    CodeIcon,
    CommentIcon,
    ContinueIcon,
    EqualIcon,
    FunctionIcon,
    LockIcon,
    PlusIcon,
    ReturnIcon,
    StopIcon,
    TransformIcon,
    VarIcon,
} from "../../resources";
import { NodeKind } from "../../utils/types";
import { Icon } from "@wso2/ui-toolkit";

// VSCode chart colors - guaranteed to be available in all webviews
// These colors are visually distinct and work well in both light and dark themes
export const CHART_COLORS = {
    // Terminal ANSI colors (chart-like)
    BLUE: "var(--vscode-terminal-ansiBlue)",
    BRIGHT_BLUE: "var(--vscode-terminal-ansiBrightBlue)",
    CYAN: "var(--vscode-terminal-ansiCyan)",
    BRIGHT_CYAN: "var(--vscode-terminal-ansiBrightCyan)",
    GREEN: "var(--vscode-terminal-ansiGreen)",
    BRIGHT_GREEN: "var(--vscode-terminal-ansiBrightGreen)",
    YELLOW: "var(--vscode-terminal-ansiYellow)",
    BRIGHT_YELLOW: "var(--vscode-terminal-ansiBrightYellow)",
    // RED: "var(--vscode-terminal-ansiRed)",
    // BRIGHT_RED: "var(--vscode-terminal-ansiBrightRed)",
    MAGENTA: "var(--vscode-terminal-ansiMagenta)",
    BRIGHT_MAGENTA: "var(--vscode-terminal-ansiBrightMagenta)",
    // A chart colour rather than a terminal one: the ANSI set has no orange, and every theme
    // defines this one to sit between its yellow and red.
    ORANGE: "var(--vscode-charts-orange)",

    // Default color
    DEFAULT: "var(--vscode-editor-foreground)",
};

// Node types grouped by color
const NODE_COLOR_GROUPS = {
    // Control flow group - blue variants
    BLUE_GROUP: [
        "IF",
        "WHILE",
        "FOREACH",
        "MATCH",
        "RETURN",
        // Sending a data event pushes the flow into a workflow waiting on it, so it reads with the
        // nodes that direct flow rather than with the data ones.
        "SEND_DATA",
        // Running or calling another workflow hands the flow to it, so these read as control flow.
        "WORKFLOW_RUN",
        "CHILD_WORKFLOW_RUN",
        "CHILD_WORKFLOW_CALL",
        "CHILD_WORKFLOW_WAIT",
        "CHILD_WORKFLOW_SEND_DATA",
    ],
    
    // Break/continue - cyan variants
    CYAN_CONTROL_GROUP: ["BREAK", "CONTINUE"],
    
    // Function/method group - green variants
    GREEN_FUNCTION_GROUP: [
        "FUNCTION", 
        "FUNCTION_CALL", 
        "DATA_MAPPER_CALL",
        "REMOTE_ACTION_CALL", 
        "RESOURCE_ACTION_CALL",
        "METHOD_CALL",
        // An activity is the unit of work a workflow executes — a call, like the ones above.
        "ACTIVITY_CALL",
        "CONNECTION_ACTIVITY_CALL",
        // Asking a person to act is the other way a workflow gets work done, so it reads in the same
        // green as the activity it stands beside.
        "HUMAN_TASK",
        // Starting a durable agent and sending it a data event are the two ways work is handed to
        // one, so they read as the other work-doing steps do.
        "DURABLE_AGENT_START",
        "DURABLE_AGENT_UPDATE",
        // The workflow accessors are plain function calls on the context, and they render the
        // function glyph, so they share the function colour.
        "WORKFLOW_CURRENT_TIME",
        "WORKFLOW_IS_REPLAYING",
        "WORKFLOW_GET_ID",
        "WORKFLOW_GET_TYPE"
    ],
    
    // AI/NP function group - cyan variants
    CYAN_FUNCTION_GROUP: [
        "AGENT_CALL",
        "TYPED_AGENT",
        "AGENT_RUN",
        "AGENT",
        "AGENTS",
        "NP_FUNCTION",
        "NP_FUNCTION_CALL",
        "MODEL_PROVIDER",
        "MODEL_PROVIDERS",
        "KNOWLEDGE_BASE",
        "KNOWLEDGE_BASES",
        "KNOWLEDGE_BASE_CALL",
        "VECTOR_STORE",
        "VECTOR_STORES",
        "EMBEDDING_PROVIDER",
        "EMBEDDING_PROVIDERS",
        "DATA_LOADER",
        "DATA_LOADERS",
        "CHUNKER",
        "CHUNKERS",
        "SHORT_TERM_MEMORY_STORE"
    ],
    // Data related - magenta variants
    MAGENTA_DATA_GROUP: [
        "VARIABLE",
        "NEW_DATA",
        "UPDATE_DATA",
        "ASSIGN",
        // Receiving a data event is where a workflow's data comes from, so it belongs with the data.
        "WAIT_DATA",
        // A sleep is the other thing a workflow suspends on, so it shares the data event's colour.
        "SLEEP",
    ],
    
    // Comments, concurrency and transactions - magenta variants
    MAGENTA_MISC_GROUP: [
        "COMMENT", 
        "FORK", 
        "WAIT", 
        "TRANSACTION", 
        "COMMIT", 
        "ROLLBACK",
        "LOCK"
    ],
    
    // Error handling - yellow variants
    YELLOW_GROUP: ["ERROR_HANDLER", "PANIC", "FAIL", "RETRY"],

    // Reading back what a durable agent produced - orange. The send and the read are the two halves
    // of one turn, so they are deliberately not the same colour: green hands work over, orange
    // collects the answer.
    ORANGE_GROUP: ["DURABLE_AGENT_RESULT", "DURABLE_AGENT_DATA_RESULT"],
};

// Workflow accessor/utility functions (`workflow:currentTime`, `workflow:sleep`, ...) all currently
// arrive from the language server as the same generic statement kind, so — like their colour and
// title — the icon has to be keyed on the function symbol rather than the node kind. SLEEP is the one
// exception with its own dedicated node kind (see NODE_ICONS below), but it is included here too so
// this map is the single source of truth if the language server ever starts sending it this way.
const WORKFLOW_MODULE_FUNCTION_ICONS: Record<string, string> = {
    currentTime: "bi-timeline",
    isReplaying: "bi-redo",
    getWorkflowId: "bi-key",
    getWorkflowType: "bi-type",
    sleep: "bi-clock",
};

// Exported so callers building their own icon (e.g. the side panel, which picks an icon before
// NodeIcon ever renders when the language server already sent one) can give a workflow accessor
// function priority over that generic icon instead of NodeIcon's own fallback ordering.
export function getWorkflowFunctionIconName(org?: string, module?: string, symbol?: string): string | undefined {
    return org === "ballerina" && module === "workflow" && symbol ? WORKFLOW_MODULE_FUNCTION_ICONS[symbol] : undefined;
}

// The prebuilt activities (Call REST API, Call SOAP API, Send Email) all arrive as one node kind and
// differ only by the function they call, so their colour is keyed on that instead: the two API calls
// read as the work-doing green of the activity family, and the email send takes the blue of the other
// send nodes. The kind is a string here because the LS sends it without a NodeKind counterpart.
const BUILTIN_ACTIVITY_KIND = "BUILTIN_ACTIVITY";
const BUILTIN_ACTIVITY_COLOR_GROUPS = {
    GREEN: ["callRestAPI", "callSoapAPI"],
    BLUE: ["sendEmail"],
};

// Get current theme type (light or dark)
export const isDarkTheme = (): boolean => {
    // Check for VSCode specific variable that indicates theme type
    // The --vscode-editor-background tends to be dark in dark themes
    const backgroundColor = getComputedStyle(document.documentElement)
        .getPropertyValue("--vscode-editor-background")
        .trim();

    // Simple check - if the background color starts with '#' and
    // is a dark color (low RGB values), we assume it's a dark theme
    if (backgroundColor.startsWith("#")) {
        const hex = backgroundColor.substring(1);
        const rgb = parseInt(hex, 16);
        const r = (rgb >> 16) & 0xff;
        const g = (rgb >> 8) & 0xff;
        const b = (rgb >> 0) & 0xff;

        // Calculate perceived brightness (ITU-R BT.709)
        const brightness = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        return brightness < 128; // Below 128 is considered dark
    }

    // Alternative check using another VSCode variable that directly indicates theme kind
    const isDark = getComputedStyle(document.documentElement).getPropertyValue("--vscode-theme-kind").includes("dark");

    return isDark;
};

// Returns the appropriate chart color for a node type, considering the current theme
export const getNodeChartColor = (nodeType: NodeKind, symbol?: string): string => {
    const dark = isDarkTheme();

    // Prebuilt activities - coloured by the function they call, not by their shared kind.
    if ((nodeType as string) === BUILTIN_ACTIVITY_KIND && symbol) {
        if (BUILTIN_ACTIVITY_COLOR_GROUPS.GREEN.includes(symbol)) {
            return CHART_COLORS.GREEN;
        }
        if (BUILTIN_ACTIVITY_COLOR_GROUPS.BLUE.includes(symbol)) {
            return dark ? CHART_COLORS.BRIGHT_BLUE : CHART_COLORS.BLUE;
        }
    }

    // Control flow group - blue variants
    if (NODE_COLOR_GROUPS.BLUE_GROUP.includes(nodeType)) {
        return dark ? CHART_COLORS.BRIGHT_BLUE : CHART_COLORS.BLUE;
    }

    // Break/continue - cyan variants when dark, blue when light
    if (NODE_COLOR_GROUPS.CYAN_CONTROL_GROUP.includes(nodeType)) {
        return dark ? CHART_COLORS.BRIGHT_CYAN : CHART_COLORS.BLUE;
    }

    // Function/method group - green variants
    if (NODE_COLOR_GROUPS.GREEN_FUNCTION_GROUP.includes(nodeType)) {
        return dark ? CHART_COLORS.GREEN : CHART_COLORS.GREEN;
    }

    // AI/NP function group - cyan variants
    if (NODE_COLOR_GROUPS.CYAN_FUNCTION_GROUP.includes(nodeType)) {
        return dark ? CHART_COLORS.BRIGHT_CYAN : CHART_COLORS.CYAN;
    }

    // Data related - magenta variants
    if (NODE_COLOR_GROUPS.MAGENTA_DATA_GROUP.includes(nodeType)) {
        return dark ? CHART_COLORS.BRIGHT_MAGENTA : CHART_COLORS.MAGENTA;
    }

    // Comments, concurrency and transactions - magenta variants
    if (NODE_COLOR_GROUPS.MAGENTA_MISC_GROUP.includes(nodeType)) {
        return dark ? CHART_COLORS.BRIGHT_MAGENTA : CHART_COLORS.MAGENTA;
    }

    // Error handling - yellow variants
    if (NODE_COLOR_GROUPS.YELLOW_GROUP.includes(nodeType)) {
        return dark ? CHART_COLORS.BRIGHT_YELLOW : CHART_COLORS.YELLOW;
    }

    // Durable agent result reads - orange. One variable for both themes: each theme defines its own
    // chart orange, so there is no bright/plain pair to choose between.
    if (NODE_COLOR_GROUPS.ORANGE_GROUP.includes(nodeType)) {
        return CHART_COLORS.ORANGE;
    }

    // Default fallback
    return CHART_COLORS.DEFAULT;
};

// Detect high contrast theme via body class set by VS Code
export const isHighContrastTheme = (): boolean => {
    return document.body.classList.contains("vscode-high-contrast") ||
        document.body.classList.contains("vscode-high-contrast-light");
};

// Get AI-specific color
export const getAIColor = (): string => {
    if (isHighContrastTheme()) {
        return "rgb(243, 133, 24)";
    }
    const dark = isDarkTheme();
    return dark ? CHART_COLORS.BRIGHT_CYAN : CHART_COLORS.CYAN;
};

// Icon mapping by node type
const NODE_ICONS: Record<NodeKind, React.FC<{ size: number; color: string; isDBConnection?: boolean }>> = {
    IF: ({ size, color }) => <BranchIcon />,
    MATCH: ({ size, color }) => <Icon name="bi-match" sx={{ fontSize: size, width: size, height: size, color }} />,
    EXPRESSION: ({ size, color }) => <CodeIcon />,
    REMOTE_ACTION_CALL: ({ size, color, isDBConnection }) =>
        isDBConnection ? <Icon name="bi-db" sx={{ fontSize: size, width: size, height: size, color }} /> : <CallIcon />,
    RESOURCE_ACTION_CALL: ({ size, color, isDBConnection }) =>
        isDBConnection ? <Icon name="bi-db" sx={{ fontSize: size, width: size, height: size, color }} /> : <CallIcon />,
    METHOD_CALL: ({ size, color, isDBConnection }) =>
        isDBConnection ? <Icon name="bi-db" sx={{ fontSize: size, width: size, height: size, color }} /> : <CodeIcon />,
    RETURN: ({ size, color }) => <ReturnIcon />,
    VARIABLE: ({ size, color }) => <VarIcon />,
    NEW_DATA: ({ size, color }) => <VarIcon />,
    UPDATE_DATA: ({ size, color }) => <VarIcon />,
    FOREACH: ({ size, color }) => <Icon name="bi-loop" sx={{ fontSize: size, width: size, height: size, color }} />,
    WHILE: ({ size, color }) => <Icon name="bi-loop" sx={{ fontSize: size, width: size, height: size, color }} />,
    BREAK: ({ size, color }) => <BreakIcon />,
    CONTINUE: ({ size, color }) => <ContinueIcon />,
    STOP: ({ size, color }) => <StopIcon />,
    ERROR_HANDLER: ({ size, color }) => <Icon name="bi-shield" sx={{ fontSize: size, width: size, height: size, color }} />,
    PANIC: ({ size, color }) => <BombIcon />,
    LOCK: ({ size, color }) => <LockIcon />,
    TRANSACTION: ({ size, color }) => <TransformIcon />,
    NEW_CONNECTION: ({ size, color }) => <PlusIcon />,
    COMMENT: ({ size, color }) => <CommentIcon />,
    ASSIGN: ({ size, color }) => <EqualIcon />,
    FUNCTION: ({ size, color }) => <FunctionIcon />,
    FUNCTION_CALL: ({ size, color }) => <FunctionIcon />,
    NP_FUNCTION_CALL: ({ size, color }) => <Icon name="bi-ai-function" sx={{ fontSize: size, width: size, height: size, color }} />,
    NP_FUNCTION: ({ size, color }) => <Icon name="bi-ai-function" sx={{ fontSize: size, width: size, height: size, color }} />,
    DATA_MAPPER_CALL: ({ size, color }) => <Icon name="dataMapper" sx={{ fontSize: size, width: size, height: size, color }} />,
    WORKFLOW_RUN: ({ size, color }) => <Icon name="bi-flowchart" sx={{ fontSize: size, width: size, height: size, color }} />,
    CHILD_WORKFLOW_RUN: ({ size, color }) => <Icon name="bi-flowchart" sx={{ fontSize: size, width: size, height: size, color }} />,
    CHILD_WORKFLOW_CALL: ({ size, color }) => <Icon name="bi-flowchart" sx={{ fontSize: size, width: size, height: size, color }} />,
    CHILD_WORKFLOW_WAIT: ({ size, color }) => <Icon name="bi-flowchart" sx={{ fontSize: size, width: size, height: size, color }} />,
    CHILD_WORKFLOW_SEND_DATA: ({ size, color }) => <Icon name="bi-flowchart" sx={{ fontSize: size, width: size, height: size, color }} />,
    // The side panel's available-node list sends these as their own dedicated kinds (unlike a placed
    // FlowNode, which arrives as a generic statement with the symbol carrying the distinction — see
    // getWorkflowFunctionIconName), so they need their icons here too, keyed by kind.
    WORKFLOW_CURRENT_TIME: ({ size, color }) => <Icon name="bi-timeline" sx={{ fontSize: size, width: size, height: size, color }} />,
    WORKFLOW_IS_REPLAYING: ({ size, color }) => <Icon name="bi-redo" sx={{ fontSize: size, width: size, height: size, color }} />,
    WORKFLOW_GET_ID: ({ size, color }) => <Icon name="bi-key" sx={{ fontSize: size, width: size, height: size, color }} />,
    WORKFLOW_GET_TYPE: ({ size, color }) => <Icon name="bi-type" sx={{ fontSize: size, width: size, height: size, color }} />,
    ACTIVITY_CALL: ({ size, color }) => <Icon name="bi-task" sx={{ fontSize: size, width: size, height: size, color }} />,
    CONNECTION_ACTIVITY_CALL: ({ size, color }) => <Icon name="bi-task" sx={{ fontSize: size, width: size, height: size, color }} />,
    // Sending a data event into a workflow: the send icon, matching the receive-side bi-import.
    SEND_DATA: ({ size, color }) => <Icon name="bi-send" sx={{ fontSize: size, width: size, height: size, color }} />,
    // Awaiting data is a receive, not a sleep: the import icon reads as "data arriving from outside".
    WAIT_DATA: ({ size, color }) => <Icon name="bi-import" sx={{ fontSize: size, width: size, height: size, color }} />,
    HUMAN_TASK: ({ size, color }) => <Icon name="bi-user" sx={{ fontSize: size, width: size, height: size, color }} />,
    // Agent driver verbs mirror the workflow data-event icons: send for sendData, import
    // (receive) for the result readers, and the agent glyph for starting an agent.
    DURABLE_AGENT_RUN: ({ size, color }) => <Icon name="bi-ai-agent" sx={{ fontSize: size, width: size, height: size, color }} />,
    DURABLE_AGENT_START: ({ size, color }) => <Icon name="bi-ai-agent" sx={{ fontSize: size, width: size, height: size, color }} />,
    DURABLE_AGENT_UPDATE: ({ size, color }) => <Icon name="bi-send" sx={{ fontSize: size, width: size, height: size, color }} />,
    DURABLE_AGENT_RESULT: ({ size, color }) => <Icon name="bi-flowchart" sx={{ fontSize: size, width: size, height: size, color }} />,
    DURABLE_AGENT_DATA_RESULT: ({ size, color }) => <Icon name="bi-import" sx={{ fontSize: size, width: size, height: size, color }} />,
    SLEEP: ({ size, color }) => <Icon name="bi-clock" sx={{ fontSize: size, width: size, height: size, color }} />,
    FORK: ({ size, color }) => <Icon name="bi-parallel" sx={{ fontSize: size, width: size, height: size, color }} />,
    WAIT: ({ size, color }) => <Icon name="bi-wait" sx={{ fontSize: size, width: size, height: size, color }} />,
    START: ({ size, color }) => <Icon name="bi-start" sx={{ fontSize: size, width: size, height: size, color }} />,
    COMMIT: ({ size, color }) => <Icon name="bi-commit" sx={{ fontSize: size, width: size, height: size, color }} />,
    ROLLBACK: ({ size, color }) => <Icon name="bi-rollback" sx={{ fontSize: size, width: size, height: size, color }} />,
    FAIL: ({ size, color }) => <Icon name="bi-error" sx={{ fontSize: size, width: size, height: size, color }} />,
    RETRY: ({ size, color }) => <Icon name="bi-retry" sx={{ fontSize: size, width: size, height: size, color }} />,
    AGENT_CALL: ({ size, color }) => <Icon name="bi-ai-agent" sx={{ fontSize: size, width: size, height: size, color }} />,
    AGENT: ({ size, color }) => <Icon name="bi-ai-agent" sx={{ fontSize: size, width: size, height: size, color }} />,
    AGENTS: ({ size, color }) => <Icon name="bi-ai-agent" sx={{ fontSize: size, width: size, height: size, color }} />,
    AGENT_RUN: ({ size, color }) => <Icon name="bi-ai-agent" sx={{ fontSize: size, width: size, height: size, color }} />,
    TYPED_AGENT: ({ size, color }) => <Icon name="bi-ai-agent" sx={{ fontSize: size, width: size, height: size, color }} />,
    MODEL_PROVIDER: ({ size, color }) => <Icon name="bi-ai-model" sx={{ fontSize: size, width: size, height: size, color }} />,
    MODEL_PROVIDERS: ({ size, color }) => <Icon name="bi-ai-model" sx={{ fontSize: size, width: size, height: size, color }} />,
    KNOWLEDGE_BASE: ({ size, color }) => <Icon name="bi-db-kb" sx={{ fontSize: size, width: size, height: size, color }} />,
    KNOWLEDGE_BASES: ({ size, color }) => <Icon name="bi-db-kb" sx={{ fontSize: size, width: size, height: size, color }} />,
    KNOWLEDGE_BASE_CALL: ({ size, color }) => <CallIcon />,
    VECTOR_STORE: ({ size, color }) => <Icon name="bi-db" sx={{ fontSize: size, width: size, height: size, color }} />,
    VECTOR_STORES: ({ size, color }) => <Icon name="bi-db" sx={{ fontSize: size, width: size, height: size, color }} />,
    EMBEDDING_PROVIDER: ({ size, color }) => <Icon name="bi-doc" sx={{ fontSize: size, width: size, height: size, color }} />,
    EMBEDDING_PROVIDERS: ({ size, color }) => <Icon name="bi-doc" sx={{ fontSize: size, width: size, height: size, color }} />,
    DATA_LOADER: ({ size, color }) => <Icon name="bi-data-table" sx={{ fontSize: size, width: size, height: size, color }} />,
    DATA_LOADERS: ({ size, color }) => <Icon name="bi-data-table" sx={{ fontSize: size, width: size, height: size, color }} />,
    CHUNKER: ({ size, color }) => <Icon name="bi-cut" sx={{ fontSize: size, width: size, height: size, color }} />,
    CHUNKERS: ({ size, color }) => <Icon name="bi-cut" sx={{ fontSize: size, width: size, height: size, color }} />,
    SHORT_TERM_MEMORY_STORE: ({ size, color }) => <Icon name="bi-memory" sx={{ fontSize: size, width: size, height: size, color }} />
    // Default case for any NodeKind not explicitly handled
} as Record<NodeKind, React.FC<{ size: number; color: string; isDBConnection?: boolean }>>;

// Component to listen for theme changes
export const ThemeListener = ({ onThemeChange }: { onThemeChange: () => void }): React.ReactElement => {
    useEffect(() => {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.attributeName === "class" || mutation.attributeName === "data-vscode-theme-kind") {
                    onThemeChange();
                }
            });
        });

        // Watch for theme changes on document element
        observer.observe(document.documentElement, { attributes: true });

        return () => observer.disconnect();
    }, [onThemeChange]);

    return null;
};

const IconWrapper = styled.div<{ color: string }>`
    svg {
        fill: ${(props) => props.color};
    }
`;

interface NodeIconProps {
    type: NodeKind;
    size?: number;
    color?: string; // Optional override color
    isDBConnection?: boolean;
    // The function a node calls, where the kind alone does not identify it (the prebuilt activities,
    // the workflow accessor functions).
    symbol?: string;
    // Scopes the symbol-keyed workflow accessor icon lookup to ballerina/workflow calls, so an
    // unrelated function that happens to be named "sleep" does not pick up the clock glyph.
    org?: string;
    module?: string;
}

export function NodeIcon(props: NodeIconProps) {
    const { type, size = 16, color, isDBConnection, symbol, org, module } = props;
    const [themeAwareColor, setThemeAwareColor] = useState<string>(color || getNodeChartColor(type, symbol));

    // Update color when theme changes
    const handleThemeChange = () => {
        if (!color) {
            // Only auto-update if no override color was provided
            setThemeAwareColor(getNodeChartColor(type, symbol));
        }
    };

    // This ensures we get the right colors on initial render and theme changes
    useEffect(() => {
        if (!color) {
            setThemeAwareColor(getNodeChartColor(type, symbol));
        }
    }, [color, type, symbol]);

    const workflowFunctionIcon = getWorkflowFunctionIconName(org, module, symbol);

    // Get icon renderer from the mapping or use CodeIcon as default
    const IconRenderer = workflowFunctionIcon
        ? ({ size, color }: { size: number; color: string }) => (
              <Icon name={workflowFunctionIcon} sx={{ fontSize: size, width: size, height: size, color }} />
          )
        : NODE_ICONS[type] || (({ size, color }: { size: number; color: string; isDBConnection?: boolean }) => <CodeIcon />);
    
    return (
        <>
            <IconWrapper color={themeAwareColor}>
                <IconRenderer size={size} color={themeAwareColor} isDBConnection={isDBConnection}/>
            </IconWrapper>
            <ThemeListener onThemeChange={handleThemeChange} />
        </>
    );
}

export default NodeIcon;
