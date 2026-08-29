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

import { FormField, HelperpaneOnChangeOptions } from "../../../Form/types";
import { CompletionItem, FnSignatureDocumentation, HelperPaneHeight } from "@wso2/ui-toolkit";
import { LineRange } from "@wso2/ballerina-core/lib/interfaces/common";
import { DiagnosticMessage } from "@wso2/ballerina-core";
import { FieldError } from "react-hook-form";
// Import InputMode from its defining module, not the `../..` editors barrel: the barrel
// re-exports it, creating a circular init where `InputMode` is undefined when
// EXPANDABLE_MODES below evaluates (order-dependent; fragile in prod, breaks under jest).
import { InputMode } from "../../MultiModeExpressionEditor/ChipExpressionEditor/types";

/**
 * Base props that all editor mode components must implement
 */
export interface EditorModeProps {
    /** Current value of the editor */
    value: string;
    /** Callback when value changes */
    onChange: (value: string, updatedCursorPosition: number) => void;
    /** Field metadata (for accessing field properties if needed) */
    field: FormField;
}

/**
 * Extended props for modes that support preview functionality (e.g., Prompt mode)
 */
export interface EditorModeWithPreviewProps extends EditorModeProps {
    /** Whether preview mode is active */
    isPreviewMode: boolean;
    /** Callback to toggle preview mode */
    onTogglePreview: (enabled: boolean) => void;
}

/**
 * Extended props for expression mode with completions and helper pane support
 */
export type AIStatusLabel = "AI Enhanced" | "AI Generated" | "Original" | null;

export interface EditorModeExpressionProps extends EditorModeProps {
    /** Callback to report AI enhancement status for display in the header */
    onAIStatusChange?: (status: AIStatusLabel) => void;
    /** Completion items for autocomplete */
    completions?: CompletionItem[];
    /** File name for context */
    fileName?: string;
    /** Target line range for context */
    targetLineRange?: LineRange;
    /** Optional function to sanitize expression for display (e.g., remove backticks) */
    sanitizedExpression?: (value: string) => string;
    rawExpression?: (value: string) => string;
    /** Function to extract arguments from function calls */
    extractArgsFromFunction?: (value: string, cursorPosition: number) => Promise<{
        label: string;
        args: string[];
        currentArgIndex: number;
        documentation?: FnSignatureDocumentation;
    }>;
    /** Helper pane renderer function */
    getHelperPane?: (
        value: string,
        onChange: (value: string, options?: HelperpaneOnChangeOptions) => void,
        helperPaneHeight: HelperPaneHeight
    ) => React.ReactNode;
    /** Whether preview mode is active */
    isPreviewMode?: boolean;
    /** Callback to toggle preview mode */
    onTogglePreview?: (enabled: boolean) => void;
    /** Form validation error */
    error?: FieldError;
    /** Form diagnostics messages */
    formDiagnostics?: DiagnosticMessage[];
    /** Input mode */
    inputMode?: InputMode;
    readOnly?: boolean;
}

export const EXPANDABLE_MODES = [
    InputMode.TEXT,
    InputMode.PROMPT,
    InputMode.EXP,
    InputMode.TEMPLATE,
    InputMode.SIMPLE_TEXT
] as const;

export type EditorMode = typeof EXPANDABLE_MODES[number];
