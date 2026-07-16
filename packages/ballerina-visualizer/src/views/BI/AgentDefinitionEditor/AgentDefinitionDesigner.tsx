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

import { Type, ServiceClassModel, ModelFromCodeRequest, FieldType, FunctionModel, NodePosition, removeStatement, EVENT_TYPE, FlowNode, NodeMetadata, ToolData, PropertyModel, getPrimaryInputType, ServiceClassSourceRequest, buildAgentToolNode, buildAgentCallToolNode, Property, DIRECTORY_MAP, LineRange, AvailableNode, AgentToolHostClass } from "@wso2/ballerina-core";
import { Codicon, Typography, ProgressRing, ThemeColors, View, Icon, Overlay, LinkButton } from "@wso2/ui-toolkit";
import { ConnectorIcon } from "@wso2/bi-diagram";
import styled from "@emotion/styled";
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { LoadingContainer } from "../../styles";
import { VariableCard } from "../ServiceClassEditor/VariableCard";
import { VariableForm } from "../ServiceClassEditor/VariableForm";
import { PanelContainer, FormField, FormValues, FormImports } from "@wso2/ballerina-side-panel";
import { applyModifications } from "../../../utils/utils";
import { getImportsForProperty } from "../../../utils/bi";
import { TopNavigationBar } from "../../../components/TopNavigationBar";
import { TitleBar } from "../../../components/TitleBar";
import { FlowNodeForm } from "../Forms/FlowNodeForm";
import { ArtifactForm } from "../Forms/ArtifactForm";
import { parseToolsString, removeToolFromAgentNode } from "../AIChatAgent/utils";
import { AIAgentSidePanel, ExtendedAgentToolRequest } from "../AIChatAgent/AIAgentSidePanel";
import { AddTool } from "../AIChatAgent/AddTool";
import { NewToolSelectionMode } from "../AIChatAgent/NewTool";
import { AddMcpServer } from "../AIChatAgent/AddMcpServer";
import { AgentInfoCard } from "../AIChatAgent/AddAgentPopup/AgentInfoCard";
import AddAgentPopup from "../AIChatAgent/AddAgentPopup";
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react";
import { FUNCTION_CALL } from "../../../constants";
import { AgentToolForm } from "../AIChatAgent/AgentToolForm";
import ConnectionConfigView from "../Connection/ConnectionConfigView";
import { cloneDeep, debounce } from "lodash";

// The + Tool menu is a small panel flow: the AddTool chooser → a source-specific sub-panel.
type ToolPanel = "NONE" | "MENU" | "CUSTOM" | "CONNECTION" | "FUNCTION" | "MCP";

const ServiceContainer = styled.div`
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
`;

const ScrollableSection = styled.div`
    display: flex;
    flex-direction: column;
    gap: 28px;
    overflow-y: auto;
    flex: 1;
    min-height: 0;
    padding: 15px 24px 24px;
`;

const Section = styled.div`
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
`;

const ScrollableContent = styled.div`
    overflow-y: auto;
    min-height: 0;
`;

const SectionTitle = styled.div`
    font-size: 14px;
    font-family: GilmerRegular;
`;

const SectionSubtitle = styled.span`
    font-size: 13px;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    margin-left: 8px;
`;

const SectionDescription = styled.div`
    margin-top: 4px;
    font-size: 12px;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
`;

const SectionHeader = styled.div`
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
`;

const Row = styled.div<{ clickable?: boolean }>`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 15px;
    margin-top: 10px;
    background-color: var(--vscode-editorHoverWidget-statusBarBackground);
    cursor: ${(p: { clickable?: boolean }) => (p.clickable ? "pointer" : "default")};
    &:hover {
        background-color: ${(p: { clickable?: boolean }) => (p.clickable ? "var(--vscode-editorHoverWidget-border)" : "var(--vscode-editorHoverWidget-statusBarBackground)")};
    }
`;

const RowInfo = styled.div`
    display: flex;
    align-items: center;
    gap: 10px;
`;

const ItemLabel = styled.span`
    align-self: center;
    font-size: 13px;
    color: ${ThemeColors.ON_SURFACE};
`;

const IconContainer = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
`;

const TypeBadge = styled.span`
    font-size: 11px;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    border: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    border-radius: 3px;
    padding: 1px 6px;
`;

const RowActions = styled.div`
    display: flex;
    align-items: center;
    gap: 10px;
`;

const AgentInputEmptyDescription = styled.div`
    font-size: 13px;
    line-height: 1.45;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
`;

const AgentPill = styled.div`
    display: inline-flex;
    align-items: center;
    gap: 6px;
    align-self: flex-start;
    max-width: 100%;
    padding: 6px 10px;
    border: 1px solid var(--vscode-editorWidget-border);
    border-radius: 4px;
    background-color: var(--vscode-input-background);
    color: var(--vscode-foreground);
    font-size: 12px;
    overflow: hidden;
`;

const AgentPillText = styled.span`
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

const AgentToolPopupFormContent = styled.div`
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    padding: 16px 20px 0;
`;

const IconButton = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    &:hover {
        background-color: var(--vscode-toolbar-hoverBackground);
        color: ${ThemeColors.ON_SURFACE};
    }
`;

// --- Configuration (role/instructions + settings) card ---
// Styled like AgentInfoCard (bordered, rounded, SURFACE_DIM) so it reads as a static read-only
// panel, distinct from the clickable grey tool/input rows.
const ConfigCard = styled.div<{ clickable?: boolean }>`
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-top: 10px;
    padding: 14px 15px;
    border: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    border-radius: 4px;
    background-color: ${ThemeColors.SURFACE_DIM};
    cursor: ${(p: { clickable?: boolean }) => (p.clickable ? "pointer" : "default")};
    transition: border-color 0.1s ease;
    &:hover {
        border-color: ${(p: { clickable?: boolean }) => (p.clickable ? ThemeColors.PRIMARY : ThemeColors.OUTLINE_VARIANT)};
    }
`;

const ResponseTypeCard = styled(ConfigCard)`
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    padding: 10px 15px;
`;

const PromptField = styled.div`
    display: flex;
    flex-direction: column;
    gap: 3px;
`;

const PromptLabel = styled.span`
    font-size: 13px;
    font-weight: 600;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
`;

// Renders role/instructions markdown (same treatment as AgentNodeWidget), clamped so long prompts don't dominate.
const MarkdownContent = styled.div<{ clamp: number }>`
    font-size: 13px;
    line-height: 1.5;
    color: ${ThemeColors.ON_SURFACE};
    display: -webkit-box;
    -webkit-line-clamp: ${(p: { clamp: number }) => p.clamp};
    -webkit-box-orient: vertical;
    overflow: hidden;

    p { margin: 0 0 0.3em 0; padding: 0; }
    p:last-child { margin-bottom: 0; }
    h1, h2, h3, h4, h5, h6 { margin: 0.4em 0 0.2em 0; padding: 0; font-weight: 600; font-size: 13px; }
    h1:first-of-type, h2:first-of-type, h3:first-of-type, h4:first-of-type, h5:first-of-type, h6:first-of-type { margin-top: 0; }
    ul, ol { margin: 0.3em 0; padding-left: 1.2em; }
    li { margin: 0 0 0.1em 0; }
    code { background-color: rgba(127, 127, 127, 0.1); padding: 1px 3px; border-radius: 2px; font-size: 12px; }
    pre { margin: 0.3em 0; padding: 4px; background-color: rgba(127, 127, 127, 0.1); border-radius: 2px; overflow-x: auto; }
    pre code { background-color: transparent; padding: 0; }
    blockquote { margin: 0.3em 0; padding-left: 8px; border-left: 2px solid ${ThemeColors.OUTLINE_VARIANT}; }
    strong { font-weight: 600; }
    em { font-style: italic; }
    a { color: ${ThemeColors.PRIMARY}; text-decoration: none; }
    a:hover { text-decoration: underline; }
`;

const PlaceholderText = styled.span`
    font-size: 13px;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    font-style: italic;
    margin-top: 2px;
`;

const StatRow = styled.div`
    display: flex;
    flex-wrap: wrap;
    border-top: 1px dashed ${ThemeColors.OUTLINE_VARIANT};
    padding-top: 12px;
`;

const Stat = styled.div`
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 0 20px;
    &:first-of-type {
        padding-left: 0;
    }
    & + & {
        border-left: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    }
`;

const StatLabel = styled.span`
    font-size: 13px;
    font-weight: 600;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
`;

const StatValue = styled.span`
    font-size: 13px;
    color: ${ThemeColors.ON_SURFACE};
    font-variant-numeric: tabular-nums;
`;

const ResponseTypeValue = styled(StatValue)`
    font-family: var(--vscode-editor-font-family);
`;

// --- Advanced disclosure (collapsible card, styled like ConfigCard) ---
const AdvancedCard = styled.div`
    display: flex;
    flex-direction: column;
    border: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    border-radius: 4px;
    background-color: ${ThemeColors.SURFACE_DIM};
    overflow: hidden;
`;

const AdvancedHeader = styled.div<{ expanded?: boolean }>`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 15px;
    cursor: pointer;
    user-select: none;
    font-size: 14px;
    font-family: GilmerRegular;
    color: ${ThemeColors.ON_SURFACE};
    border-bottom: 1px solid ${(p: { expanded?: boolean }) => (p.expanded ? ThemeColors.OUTLINE_VARIANT : "transparent")};
    &:hover {
        background-color: var(--vscode-toolbar-hoverBackground);
    }
`;

const AdvancedBody = styled.div`
    display: flex;
    flex-direction: column;
    padding: 12px 15px 14px;
`;

// Constructor entry, styled like the Service Class Designer's Constructor row.
const InfoSection = styled.div`
    display: flex;
    align-items: center;
    padding: 0 0 12px;
`;

// The inner `ai:Agent` field is implementation detail — hide it from the Inputs list.
function isInnerAgentField(field: FieldType): boolean {
    const typeValue = (field.type?.value ?? "").replace(/\s/g, "");
    return /(^|:)Agent$/.test(typeValue);
}

function isModelProviderType(typeValue?: string): boolean {
    return /(^|:)ModelProvider$/.test((typeValue ?? "").replace(/\s/g, ""));
}

function isMemoryType(typeValue?: string): boolean {
    return /(^|:)Memory\??$/.test((typeValue ?? "").replace(/\s/g, ""));
}

const RUN_ERROR_ARM = "ai:Error";

function outputTypeOf(returnType?: string): string {
    if (!returnType) return "";
    const arm = returnType.split("|").map((s) => s.trim()).find((s) => s !== "ai:Error" && s !== "error");
    return arm ?? returnType.trim();
}

// Strip a Ballerina string literal down to its rendered text: `string \`...\``, backticks, or quotes.
function promptText(raw?: string): string {
    if (!raw) return "";
    let s = raw.trim();
    s = s.replace(/^string\s*`/, "");
    if (s.endsWith("`")) s = s.slice(0, -1);
    if (s.startsWith("`") && s.endsWith("`")) s = s.slice(1, -1);
    if (s.startsWith('"') && s.endsWith('"')) s = s.slice(1, -1);
    return s;
}

// Secondary agent settings shown as a read-only stat row (rendered only when present on the node).
const SETTING_KEYS: { key: string; label: string; format?: (v: string) => string }[] = [
    { key: "maxIter", label: "Max Iterations" },
    { key: "verbose", label: "Verbose", format: (v) => (v === "true" ? "On" : v === "false" ? "Off" : v) },
    { key: "agentType", label: "Agent Type" }
];

function extractSettings(agentNode?: FlowNode): { label: string; value: string }[] {
    if (!agentNode) return [];
    const props = agentNode.properties as Record<string, PropertyModel | undefined>;
    return SETTING_KEYS.map(({ key, label, format }) => {
        const raw = props?.[key]?.value;
        const value = typeof raw === "string" ? raw.trim() : raw != null ? String(raw) : "";
        return value ? { label, value: format ? format(value) : value } : null;
    }).filter((s): s is { label: string; value: string } => s !== null);
}

// Prefer the LS-resolved tools (icons + MCP/Agent kinds); otherwise parse the inline `tools = [self.x, ...]` names.
function extractTools(agentNode: FlowNode): ToolData[] {
    const lsTools = (agentNode.metadata?.data as NodeMetadata)?.tools;
    if (lsTools && lsTools.length > 0) {
        return lsTools;
    }
    // Tool elements are `self.<name>` field refs; strip the receiver so the name matches the class method.
    const stripReceiver = (raw: string): string => (raw.startsWith("self.") ? raw.slice("self.".length) : raw);
    const toolsValue = (agentNode.properties as any)?.tools?.value;
    if (typeof toolsValue === "string") {
        return parseToolsString(toolsValue).map((raw) => ({ name: stripReceiver(raw) }));
    }
    if (Array.isArray(toolsValue)) {
        return toolsValue
            .map((tool: unknown) => (typeof tool === "string" ? tool : (tool as { value?: unknown })?.value))
            .filter((name: unknown): name is string => typeof name === "string")
            .map((raw: string) => ({ name: stripReceiver(raw) }));
    }
    return [];
}

function isAgentTypedField(field: FieldType): boolean {
    const typeValue = String(field.type?.value ?? "").replace(/\s/g, "");
    if (typeValue === "ai:Agent") {
        return true;
    }
    const typeName = typeValue.includes(":") ? typeValue.split(":").pop() : typeValue;
    return Boolean(typeName && /Agent(Type)?$/.test(typeName));
}

function inferAgentTypeImports(typeValue: string) {
    const normalized = typeValue.replace(/\s/g, "");
    return normalized === "ai:Agent" ? { ai: "ballerina/ai" } : undefined;
}

function uniqueAgentInputName(reservedNames: string[]): string {
    const used = new Set(reservedNames);
    let index = 1;
    let candidate = "agent";
    while (used.has(candidate)) {
        candidate = `agent${index++}`;
    }
    return candidate;
}

function lowerFirst(value: string): string {
    return value ? value.charAt(0).toLowerCase() + value.slice(1) : value;
}

function suggestAgentInputName(typeName: string, reservedNames: string[]): string {
    const base = lowerFirst(typeName.replace(/[^A-Za-z0-9_]/g, "")) || "agent";
    const used = new Set(reservedNames);
    let index = 1;
    let candidate = base;
    while (used.has(candidate)) {
        candidate = `${base}${index++}`;
    }
    return candidate;
}

function defaultModuleName(projectPath: string): string {
    return projectPath.split(/[\\/]/).filter(Boolean).pop() ?? "";
}

interface AgentDependencyDraft {
    typeValue: string;
    typeImports?: Record<string, string>;
    name: string;
}

function agentDependencyDraftFromNode(agent: AvailableNode, reservedNames: string[], projectPath: string): AgentDependencyDraft {
    const moduleName = agent.codedata?.module ?? "";
    const prefix = moduleName.split(".").pop() || moduleName;
    const typeName = agent.codedata?.object || agent.metadata?.label || "Agent";
    const isSameDefaultModule = moduleName === defaultModuleName(projectPath);
    const typeValue = prefix && !isSameDefaultModule ? `${prefix}:${typeName}` : typeName;
    const typeImports = agent.codedata?.org && moduleName && !isSameDefaultModule
        ? { [prefix]: `${agent.codedata.org}/${moduleName}` }
        : undefined;
    return {
        typeValue,
        typeImports,
        name: suggestAgentInputName(typeName, reservedNames),
    };
}

function genericAgentDependencyDraft(reservedNames: string[]): AgentDependencyDraft {
    return {
        typeValue: "ai:Agent",
        typeImports: { ai: "ballerina/ai" },
        name: uniqueAgentInputName(reservedNames),
    };
}

function agentClassDisplayName(typeValue?: string, fallback?: string): string {
    const normalized = String(typeValue ?? "").replace(/\s/g, "");
    if (!normalized) {
        return fallback ?? "Agent";
    }
    const typeName = normalized.includes(":") ? normalized.split(":").pop() : normalized;
    return typeName === "Agent" && normalized === "ai:Agent" ? "Agent" : (typeName || fallback || "Agent");
}

function buildAgentDependencyField(draft: AgentDependencyDraft, name: string, classLineRange: LineRange): FieldType {
    return {
        isPrivate: true,
        isFinal: true,
        codedata: { lineRange: classLineRange },
        type: {
            metadata: { label: "Agent Type", description: "The injected agent dependency type" },
            enabled: true, editable: false, value: draft.typeValue,
            isType: true, optional: false, advanced: false, addNewButton: false,
            imports: draft.typeImports ?? inferAgentTypeImports(draft.typeValue),
            types: [{ fieldType: "TYPE", selected: false }],
        },
        name: {
            metadata: { label: "Input Name", description: "The name of the injected agent dependency" },
            enabled: true, editable: true, value: name,
            isType: false, optional: false, advanced: false, addNewButton: false,
            types: [{ fieldType: "IDENTIFIER", selected: false }],
        },
        defaultValue: {
            metadata: { label: "Default Value", description: "The default value" },
            value: "", enabled: false, editable: true, isType: false, optional: false, advanced: false,
            types: [{ fieldType: "EXPRESSION", selected: true }], addNewButton: false,
        },
        enabled: true, editable: true, optional: false, advanced: false,
    } as FieldType;
}

interface AgentDefinitionAgentToolFormProps {
    filePath: string;
    reservedNames: string[];
    projectPath: string;
    classLineRange: LineRange;
    hostClass: AgentToolHostClass;
    onSave: () => void;
    onCancel: () => void;
}

function AgentDefinitionAgentToolForm(props: AgentDefinitionAgentToolFormProps): JSX.Element {
    const { filePath, reservedNames, projectPath, classLineRange, hostClass, onSave, onCancel } = props;
    const { rpcClient } = useRpcContext();
    const [saving, setSaving] = useState<boolean>(false);
    const [dependencyDraft, setDependencyDraft] = useState<AgentDependencyDraft>();
    const [includeContext, setIncludeContext] = useState<boolean>(false);

    const selectDependencyDraft = (draft: AgentDependencyDraft) => {
        setDependencyDraft(draft);
    };

    const currentAgentName = dependencyDraft?.name ?? "";
    const currentAgentClassName = agentClassDisplayName(dependencyDraft?.typeValue, currentAgentName);

    const handlePickerBack = () => {
        setDependencyDraft(undefined);
    };

    const selectedSummary = (
        <AgentPill title={currentAgentClassName}>
            <Icon name="bi-ai-agent" sx={{ width: 14, height: 14, fontSize: 14 }} />
            <AgentPillText>{currentAgentClassName}</AgentPillText>
        </AgentPill>
    );
    const descriptionAgentName = currentAgentClassName === "Agent" ? "the generic agent" : currentAgentClassName;

    const fields: FormField[] = [
        {
            key: "name",
            label: "Tool Name",
            type: "IDENTIFIER",
            optional: false,
            editable: true,
            documentation: "Enter a unique name for the tool.",
            value: `${currentAgentName}Tool`,
            types: [{ fieldType: "IDENTIFIER", scope: "Global", selected: false }],
            enabled: true,
        },
        {
            key: "description",
            label: "Description",
            type: "TEXTAREA",
            optional: true,
            editable: true,
            documentation: "Describe what this tool does. The agent uses this to decide when to invoke the tool.",
            value: `Delegates a query to ${descriptionAgentName}.`,
            types: [{ fieldType: "STRING", selected: false }],
            enabled: true,
        },
    ];

    const handleSubmit = async (data: FormValues) => {
        if (saving) {
            return;
        }
        setSaving(true);
        try {
            const inputName = dependencyDraft?.name ?? currentAgentName;
            if (dependencyDraft) {
                await rpcClient.getBIDiagramRpcClient().addClassInitParameter({
                    filePath,
                    field: buildAgentDependencyField(dependencyDraft, inputName, classLineRange),
                    codedata: { lineRange: classLineRange },
                });
                await rpcClient.getAIAgentRpcClient().fixMissingImports();
            }
            const toolName = String(data.name ?? "").trim() || `${inputName}Tool`;
            const description = String(data.description ?? "")
                .replace(/```[\s\S]*?```/g, "")
                .replace(/\n/g, " ")
                .trim();
            await rpcClient.getBIDiagramRpcClient().getSourceCode({
                filePath,
                flowNode: buildAgentCallToolNode(toolName, inputName, includeContext, description, hostClass,
                    `self.${inputName}`),
                artifactData: { artifactType: DIRECTORY_MAP.AGENT_DEFINITION },
            });
            onSave();
        } catch (error) {
            console.error(">>> agent definition: error creating agent tool", error);
        } finally {
            setSaving(false);
        }
    };

    const toolForm = currentAgentName ? (
        <AgentToolPopupFormContent>
            <ArtifactForm
                key={`${currentAgentName}-${dependencyDraft?.typeValue ?? "existing"}`}
                preserveFieldOrder={false}
                fileName={filePath}
                targetLineRange={{ startLine: { line: 0, offset: 0 }, endLine: { line: 0, offset: 0 } }}
                fields={fields}
                recordTypeFields={[]}
                onSubmit={handleSubmit}
                submitText={saving ? "Adding..." : "Add Tool"}
                isSaving={saving}
                helperPaneSide="left"
                footerActionButton
                injectedComponents={[
                    { component: selectedSummary, index: 0 },
                    {
                        component: (
                            <label style={{ display: "flex", alignItems: "flex-start", gap: 8, marginTop: 4 }}>
                                <input
                                    type="checkbox"
                                    checked={includeContext}
                                    onChange={(e) => setIncludeContext(e.target.checked)}
                                />
                                <div>
                                    Pass context to {currentAgentName}
                                    <AgentInputEmptyDescription>
                                        Forwards the calling agent's context to {currentAgentName} when the tool runs.
                                    </AgentInputEmptyDescription>
                                </div>
                            </label>
                        ),
                        index: fields.length + 1,
                    },
                ]}
            />
        </AgentToolPopupFormContent>
    ) : undefined;

    return createPortal(
        <AddAgentPopup
            isPopup
            dependencyMode
            projectPath={projectPath}
            onClose={onCancel}
            onNavigateToOverview={onCancel}
            onGenericAgentSelected={() => selectDependencyDraft(genericAgentDependencyDraft(reservedNames))}
            onAgentSelectedForDependency={(agent) => {
                selectDependencyDraft(agentDependencyDraftFromNode(agent, reservedNames, projectPath));
            }}
            dependencyToolForm={toolForm}
            onDependencyToolFormBack={handlePickerBack}
        />,
        document.body
    );
}

interface AgentDefinitionDesignerProps {
    projectPath: string;
    fileName: string;
    position: NodePosition;
    type?: Type;
}

export function AgentDefinitionDesigner(props: AgentDefinitionDesignerProps) {
    const { projectPath, fileName, position, type } = props;
    const { rpcClient } = useRpcContext();
    const [agentClassModel, setAgentClassModel] = useState<ServiceClassModel>();
    const [agentNode, setAgentNode] = useState<FlowNode>(undefined);
    const [agentTools, setAgentTools] = useState<ToolData[]>([]);
    const [panelKind, setPanelKind] = useState<"config" | "agent" | "tool" | "variable" | "connection" | "outputType" | null>(null);
    const [panelOpen, setPanelOpen] = useState<boolean>(false);
    // Bumped on each open so the panel remounts and replays the slide-in; kept stable through close for the slide-out.
    const [panelSeq, setPanelSeq] = useState<number>(0);
    const [editingVariable, setEditingVariable] = useState<FieldType>(undefined);
    const [isNew, setIsNew] = useState<boolean>(false);
    const [isSaving, setIsSaving] = useState<boolean>(false);
    const [classFilePath, setClassFilePath] = useState<string>("");
    const [advancedOpen, setAdvancedOpen] = useState<boolean>(false);
    const [toolPanel, setToolPanel] = useState<ToolPanel>("NONE");
    const [toolPanelBack, setToolPanelBack] = useState<(() => void) | null>(null);
    const [agentToolPopupOpen, setAgentToolPopupOpen] = useState<boolean>(false);
    const [editingMcpNode, setEditingMcpNode] = useState<FlowNode>();
    // Class-owned connections (`self.<field> = check new (...)`) — read-listed, editable in place.
    const [connections, setConnections] = useState<FlowNode[]>([]);
    const [editingConnection, setEditingConnection] = useState<FlowNode>();
    // Source edits can move the class declaration. Keep the latest resolved location and class name
    // outside render state so project-content notifications always refresh the right agent definition.
    const classPositionRef = useRef<NodePosition>(position);
    const classNameRef = useRef<string>();
    const refreshVersionRef = useRef(0);
    const refreshRef = useRef<(posOverride?: NodePosition) => Promise<void>>();
    const requestRefreshRef = useRef<(() => void)>();
    // Suppresses content-update refreshes during a multi-edit op (e.g. tool delete), so the UI never
    // renders the transient invalid source between the edits. Preserve, rather than drop, the update signal so a
    // refresh still runs once the operation completes.
    const suppressRefreshRef = useRef(false);
    const refreshPendingRef = useRef(false);

    useEffect(() => {
        classPositionRef.current = position;
        classNameRef.current = undefined;
        void refresh(position);
    }, [position]);

    useEffect(() => {
        // A single source update may emit several notifications while the language server rebuilds
        // its models. Coalesce them and use refs so this callback never refreshes a stale position.
        const debouncedRefresh = debounce(() => {
            if (suppressRefreshRef.current) {
                refreshPendingRef.current = true;
                return;
            }
            refreshPendingRef.current = false;
            void refreshRef.current?.();
        }, 300);
        requestRefreshRef.current = debouncedRefresh;
        const unsubscribe = rpcClient.onProjectContentUpdated(debouncedRefresh);
        return () => {
            unsubscribe?.();
            debouncedRefresh.cancel();
            if (requestRefreshRef.current === debouncedRefresh) {
                requestRefreshRef.current = undefined;
            }
        };
    }, [rpcClient]);

    const refresh = async (posOverride?: NodePosition) => {
        if (!fileName) return;
        const refreshVersion = ++refreshVersionRef.current;
        const pos = posOverride ?? (await resolveClassPosition()) ?? classPositionRef.current;
        if (refreshVersion !== refreshVersionRef.current) return;

        classPositionRef.current = pos;
        const model = await getAgentClassModel(pos, refreshVersion);
        if (refreshVersion !== refreshVersionRef.current) return;

        await loadAgentNode(pos, refreshVersion);
        if (refreshVersion !== refreshVersionRef.current) return;

        await loadConnections(model, refreshVersion);
    };
    refreshRef.current = refresh;

    const resolveClassPosition = async (): Promise<NodePosition | undefined> => {
        const className = classNameRef.current;
        if (!className) return undefined;
        try {
            const structure = await rpcClient.getBIDiagramRpcClient().getProjectStructure();
            for (const project of structure?.projects ?? []) {
                const match = (project.directoryMap?.[DIRECTORY_MAP.AGENT_DEFINITIONS] ?? [])
                    .find((artifact) => artifact.name === className);
                if (match?.position) {
                    return match.position;
                }
            }
        } catch {
            return undefined;
        }
        return undefined;
    };

    const getAgentClassModel = async (pos: NodePosition = classPositionRef.current, refreshVersion?: number): Promise<ServiceClassModel | undefined> => {
        if (!pos || !fileName) return undefined;

        // fileName (value.documentUri) is already the absolute class-file path.
        const request: ModelFromCodeRequest = {
            filePath: fileName,
            codedata: {
                lineRange: {
                    startLine: { line: pos.startLine, offset: pos.startColumn },
                    endLine: { line: pos.endLine, offset: pos.endColumn }
                }
            },
            context: "TYPE_DIAGRAM"
        };

        const response = await rpcClient.getBIDiagramRpcClient().getServiceClassModel(request);
        if (response.model) {
            if (refreshVersion === undefined || refreshVersion === refreshVersionRef.current) {
                classNameRef.current = response.model.name;
                setAgentClassModel(response.model);
                setClassFilePath(fileName);
            }
            return response.model;
        }
        return undefined;
    };

    // Class-owned connections created in `init` (`self.<field> = check new (...)`); MCP toolkits are surfaced under Tools.
    const loadConnections = async (model?: ServiceClassModel, refreshVersion?: number) => {
        if (!model?.codedata?.lineRange) return;
        try {
            const response = await rpcClient.getBIDiagramRpcClient().getClassOwnedNodes({
                filePath: fileName,
                classLineRange: model.codedata.lineRange
            });
            if (refreshVersion === undefined || refreshVersion === refreshVersionRef.current) {
                setConnections((response.flowModel?.variables ?? []).filter((node) => node.codedata?.node === "NEW_CONNECTION"));
            }
        } catch (error) {
            console.error(">>> agent definition: error loading connections", error);
        }
    };

    const loadAgentNode = async (pos: NodePosition = classPositionRef.current, refreshVersion?: number) => {
        if (!pos || !fileName) return;
        try {
            const response = await rpcClient.getBIDiagramRpcClient().getFlowModel({
                filePath: fileName,
                startLine: { line: pos.startLine, offset: pos.startColumn },
                endLine: { line: pos.endLine, offset: pos.endColumn }
            });
            // Keep current tools on a stale/failed fetch.
            if (!response?.flowModel) {
                return;
            }
            const agentDecl = response.flowModel.nodes?.find((node) => node.codedata?.node === "AGENT");
            // A project-content update can arrive before the language server has rebuilt the class flow model.
            // Preserve the last valid node rather than clearing the designer and its open tool panel mid-refresh.
            if (!agentDecl) {
                return;
            }
            if (refreshVersion === undefined || refreshVersion === refreshVersionRef.current) {
                setAgentNode(agentDecl);
                setAgentTools(extractTools(agentDecl));
            }
        } catch (error) {
            console.error(">>> agent definition: error loading agent node", error);
        }
    };

    const handleSubmitAgent = async (updatedNode?: FlowNode) => {
        if (!updatedNode) return;
        setIsSaving(true);
        try {
            await rpcClient.getBIDiagramRpcClient().getSourceCode({
                filePath: classFilePath,
                flowNode: updatedNode,
                artifactData: { artifactType: DIRECTORY_MAP.AGENT_DEFINITION }
            });
        } catch (error) {
            console.error(">>> agent definition: error saving agent form", error);
        } finally {
            setIsSaving(false);
            setPanelOpen(false);
        }
    };

    // Name + description edit — mirrors ServiceClassConfig, but inline so we stay on the designer.
    const configFields: FormField[] = React.useMemo(() => {
        if (!agentClassModel) return [];
        const fields: FormField[] = [];
        const nameProperty = agentClassModel.properties?.["name"] as PropertyModel;
        if (nameProperty) {
            fields.push({
                key: "name",
                label: "Agent Definition Name",
                type: "IDENTIFIER",
                optional: nameProperty.optional,
                editable: nameProperty.editable,
                advanced: nameProperty.advanced,
                enabled: nameProperty.enabled,
                documentation: "The name of the agent definition",
                value: nameProperty.value || "",
                types: nameProperty?.types,
                lineRange: nameProperty.codedata?.lineRange
            });
        }
        if (agentClassModel.documentation) {
            const docProperty = agentClassModel.documentation as PropertyModel;
            fields.push({
                key: "documentation",
                label: "Description",
                type: getPrimaryInputType(docProperty?.types)?.fieldType || "string",
                optional: docProperty.optional,
                editable: docProperty.editable,
                advanced: docProperty.advanced,
                enabled: docProperty.enabled,
                documentation: "The description of the agent definition",
                value: docProperty.value || "",
                types: docProperty?.types,
                lineRange: docProperty.codedata?.lineRange
            });
        }
        return fields;
    }, [agentClassModel]);

    const handleConfigSubmit = async (data: FormValues) => {
        if (!agentClassModel) return;
        setIsSaving(true);
        try {
            const updatedModel = { ...agentClassModel };
            let hasChanges = false;
            if (data.name && updatedModel.properties?.["name"]) {
                const nameProp = updatedModel.properties["name"] as PropertyModel;
                if (nameProp.value !== data.name) {
                    nameProp.value = data.name;
                    hasChanges = true;
                }
            }
            if (updatedModel.documentation && updatedModel.documentation.value !== data.documentation) {
                updatedModel.documentation.value = data.documentation;
                hasChanges = true;
            }
            if (hasChanges) {
                const request: ServiceClassSourceRequest = { filePath: classFilePath, serviceClass: updatedModel };
                await rpcClient.getBIDiagramRpcClient().updateServiceClass(request);
            }
        } catch (error) {
            console.error(">>> agent definition: error saving name/description", error);
        } finally {
            setIsSaving(false);
            setPanelOpen(false);
        }
    };

    const handleOutputTypeSave = async (data: FormValues, formImports?: FormImports) => {
        const runFn = agentClassModel?.functions?.find((f) => f.kind === "DEFAULT" && f.name?.value === "run");
        if (!runFn || !agentClassModel) return;
        setIsSaving(true);
        try {
            const chosen = String(data.returnType ?? "").trim();
            if (!chosen) return;
            const updatedRun: FunctionModel = {
                ...runFn,
                returnType: {
                    ...runFn.returnType,
                    value: `${chosen}|${RUN_ERROR_ARM}`,
                    imports: getImportsForProperty("returnType", formImports),
                },
            };
            await rpcClient.getServiceDesignerRpcClient().updateResourceSourceCode({
                filePath: classFilePath,
                codedata: { lineRange: agentClassModel.codedata.lineRange },
                function: updatedRun,
                artifactType: DIRECTORY_MAP.AGENT_DEFINITION,
            });
        } catch (error) {
            console.error(">>> agent definition: error saving output type", error);
        } finally {
            setIsSaving(false);
            setPanelOpen(false);
        }
    };

    const openPanel = (kind: "config" | "agent" | "tool" | "variable" | "connection" | "outputType") => {
        setPanelKind(kind);
        setPanelSeq((n) => n + 1);
        setPanelOpen(true);
    };

    // For whole-card click-to-edit: ignore clicks that are actually text selections, so selecting/copying
    // the name, role, or instructions doesn't open the edit form.
    const openPanelUnlessSelecting = (kind: "config" | "agent") => {
        if (window.getSelection()?.toString()) return;
        openPanel(kind);
    };

    const handleClosePanel = () => {
        setPanelOpen(false);
        if (panelKind === "tool") {
            setEditingMcpNode(undefined);
        }
        if (panelKind === "connection") {
            setEditingConnection(undefined);
        }
    };

    const handleEditVariable = (variable: FieldType) => {
        setIsNew(false);
        setEditingVariable(variable);
        openPanel("variable");
    };

    const handleVariableSave = async (updatedVariable: FieldType) => {
        setIsSaving(true);
        try {
            if (isNew) {
                await rpcClient.getBIDiagramRpcClient().addClassInitParameter({
                    filePath: classFilePath,
                    field: updatedVariable,
                    codedata: {
                        lineRange: {
                            fileName: agentClassModel.codedata.lineRange.fileName,
                            startLine: { line: agentClassModel.codedata.lineRange.startLine.line, offset: agentClassModel.codedata.lineRange.startLine.offset },
                            endLine: { line: agentClassModel.codedata.lineRange.endLine.line, offset: agentClassModel.codedata.lineRange.endLine.offset }
                        }
                    }
                });
            } else {
                await rpcClient.getBIDiagramRpcClient().updateClassInitParameter({
                    filePath: classFilePath,
                    field: updatedVariable
                });
            }
            setPanelOpen(false);
        } catch (error) {
            console.error('Error updating variable:', error);
        }
        setIsSaving(false);
    };

    const handleCloseVariableForm = () => setPanelOpen(false);

    const handleAddVariable = () => {
        const newVariable: FieldType = {
            isPrivate: true,
            isFinal: true,
            codedata: {
                lineRange: {
                    fileName: agentClassModel.codedata.lineRange.fileName,
                    startLine: { line: agentClassModel.codedata.lineRange.startLine.line, offset: agentClassModel.codedata.lineRange.startLine.offset },
                    endLine: { line: agentClassModel.codedata.lineRange.endLine.line, offset: agentClassModel.codedata.lineRange.endLine.offset }
                }
            },
            type: {
                metadata: { label: "Variable Type", description: "The type of the variable" },
                enabled: true, editable: true, value: "", types: [{ fieldType: "TYPE", selected: false }],
                isType: true, optional: false, advanced: false, addNewButton: false
            },
            name: {
                metadata: { label: "Variable Name", description: "The name of the variable" },
                enabled: true, editable: true, value: "", types: [{ fieldType: "IDENTIFIER", selected: false }],
                isType: false, optional: false, advanced: false, addNewButton: false
            },
            defaultValue: {
                metadata: { label: "Initial Value", description: "The initial value of the variable" },
                value: "", enabled: true, editable: true, isType: false, optional: false, advanced: false,
                types: [{ fieldType: "EXPRESSION", selected: true }], addNewButton: false
            },
            enabled: true, editable: true, optional: false, advanced: false
        };
        setIsNew(true);
        setEditingVariable(newVariable);
        openPanel("variable");
    };

    const handleDeleteVariable = async (variable: FieldType) => {
        await rpcClient.getBIDiagramRpcClient().removeClassInitParameter({
            filePath: classFilePath,
            field: variable
        });
    };

    const handleViewTool = async (tool: ToolData) => {
        if (tool.type === "MCP Server") {
            const response = await rpcClient.getBIDiagramRpcClient().getClassOwnedNodes({
                filePath: classFilePath,
                classLineRange: agentClassModel.codedata.lineRange,
            });
            const mcpNode = response.flowModel?.variables?.find((node) =>
                node.codedata?.node === "MCP_TOOL_KIT" && node.properties?.variable?.value === tool.name
            );
            if (!mcpNode) return;
            setEditingMcpNode(mcpNode);
            setToolPanel("MCP");
            setToolPanelBack(null);
            openPanel("tool");
            return;
        }
        const func = agentClassModel?.functions?.find((f) => f.name.value === tool.name);
        if (!func?.codedata?.lineRange) return;
        openFunctionFlow(func);
    };

    const handleAddTool = () => {
        setToolPanel("MENU");
        setToolPanelBack(null);
        setEditingMcpNode(undefined);
        openPanel("tool");
    };

    const handleCloseToolPanel = () => {
        setPanelOpen(false);
        setEditingMcpNode(undefined);
    };

    const handleToolSaved = () => {
        handleCloseToolPanel();
        setAgentToolPopupOpen(false);
        requestRefreshRef.current?.();
    };

    const finishMultiEditRefresh = () => {
        suppressRefreshRef.current = false;
        if (refreshPendingRef.current) {
            refreshPendingRef.current = false;
            requestRefreshRef.current?.();
        }
    };

    const openAgentToolPopup = () => {
        setPanelOpen(false);
        setToolPanel("MENU");
        setToolPanelBack(null);
        setAgentToolPopupOpen(true);
    };

    // Creates the tool as an @ai:AgentTool method INSIDE the class and wires it into the inner tools=[...],
    // in one getSourceCode call (AgentToolBuilder places + wires when passed the host class).
    const handleToolSubmit = async (data: ExtendedAgentToolRequest) => {
        if (!data.toolName || !agentClassModel) return;

        let flowNode: FlowNode;
        let connection: string;
        if (data.selectedCodeData?.node === FUNCTION_CALL) {
            if (!data.functionNode) return;
            flowNode = data.functionNode as unknown as FlowNode;
            connection = "";
        } else {
            if (!data.flowNode) return;
            flowNode = data.flowNode;
            // Connection tools always call their client field from the agent definition.
            connection = data.selectedCodeData?.parentSymbol ? `self.${data.selectedCodeData.parentSymbol}` : "";
        }

        setIsSaving(true);
        // Two edits (tool method + fixMissingImports) leave the source briefly inconsistent; suppress
        // refreshes until both land, then refresh once so the new tool renders without a manual reload.
        suppressRefreshRef.current = true;
        try {
            if (flowNode.codedata) {
                flowNode.codedata.isNew = true;
            }
            // Carry parameter-type imports so the generated wrapper resolves them.
            if (data.parameterImports && flowNode.properties) {
                const props = flowNode.properties as Record<string, Property>;
                const targetKey = props["type"] ? "type" : Object.keys(props)[0];
                if (targetKey && props[targetKey]) {
                    const cleanedImports: Record<string, string> = {};
                    for (const [prefix, moduleId] of Object.entries(data.parameterImports)) {
                        cleanedImports[prefix] = moduleId.replace(/:[^/]+$/, "");
                    }
                    props[targetKey].imports = { ...props[targetKey].imports, ...cleanedImports };
                }
            }

            const toolNode = buildAgentToolNode(flowNode, data.toolName, data.description, connection,
                data.toolParameters, { className: agentClassModel.name, filePath: classFilePath });
            await rpcClient.getBIDiagramRpcClient().getSourceCode({
                filePath: classFilePath,
                flowNode: toolNode,
                artifactData: { artifactType: DIRECTORY_MAP.AGENT_DEFINITION }
            });
            await rpcClient.getAIAgentRpcClient().fixMissingImports();
        } catch (error) {
            console.error(">>> agent definition: error creating tool", error);
        } finally {
            setIsSaving(false);
            handleCloseToolPanel();
            finishMultiEditRefresh();
        }
    };

    // Removes the @ai:AgentTool class method, then unwires self.<tool> from the inner tools=[...].
    // The method (below init) is deleted first so the agent's line range stays valid for the re-emit.
    const handleDeleteTool = async (tool: ToolData) => {
        const previousTools = agentTools;
        setAgentTools((tools) => tools.filter((t) => t.name !== tool.name));
        setIsSaving(true);
        // Delete is two edits (remove method, then unwire self.<tool>); the source is briefly invalid
        // between them. Suppress refreshes until both land so role/instructions don't flicker.
        suppressRefreshRef.current = true;
        try {
            if (tool.type === "MCP Server") {
                await rpcClient.getBIDiagramRpcClient().removeClassOwnedNode({
                    filePath: classFilePath,
                    fieldName: tool.name,
                    classLineRange: agentClassModel.codedata.lineRange,
                    wiring: { kind: "INNER_AGENT_TOOLS" },
                    cleanup: { generatedHelperClass: true },
                });
                return;
            }
            const func = agentClassModel?.functions?.find((f) => f.name.value === tool.name);
            if (func?.codedata?.lineRange) {
                const pos: NodePosition = {
                    startLine: func.codedata.lineRange.startLine.line,
                    startColumn: func.codedata.lineRange.startLine.offset,
                    endLine: func.codedata.lineRange.endLine.line,
                    endColumn: func.codedata.lineRange.endLine.offset
                };
                await applyModifications(rpcClient, [removeStatement(pos)], classFilePath);
            }
            if (agentNode) {
                const updated = await removeToolFromAgentNode(agentNode, `self.${tool.name}`);
                if (updated) {
                    await rpcClient.getBIDiagramRpcClient().getSourceCode({
                        filePath: classFilePath,
                        flowNode: updated,
                        artifactData: { artifactType: DIRECTORY_MAP.AGENT_DEFINITION }
                    });
                }
            }
        } catch (error) {
            console.error(">>> agent definition: error deleting tool", error);
            setAgentTools(previousTools);
        } finally {
            setIsSaving(false);
            finishMultiEditRefresh();
        }
    };

    // Lock the name on edit — renaming would orphan the old field (upsert keys the delete off the new name).
    const handleEditConnection = (connection: FlowNode) => {
        const node = cloneDeep(connection);
        if (node.properties?.variable) {
            node.properties.variable.editable = false;
        }
        setEditingConnection(node);
        openPanel("connection");
    };

    // Edit round-trips through upsert (delete field + assignment, regenerate as `self.<field> = check new (...)`).
    const handleConnectionSave = async (updatedNode?: FlowNode) => {
        if (!updatedNode || !agentClassModel) return;
        setIsSaving(true);
        try {
            await rpcClient.getBIDiagramRpcClient().upsertClassOwnedNode({
                filePath: classFilePath,
                flowNode: updatedNode,
                classLineRange: agentClassModel.codedata.lineRange
            });
        } catch (error) {
            console.error(">>> agent definition: error saving connection", error);
        } finally {
            setIsSaving(false);
            setPanelOpen(false);
            setEditingConnection(undefined);
        }
    };

    const handleDeleteConnection = async (connection: FlowNode) => {
        const name = String(connection.properties?.variable?.value ?? "");
        if (!name || !agentClassModel) return;
        const previous = connections;
        setConnections((cs) => cs.filter((c) => c.properties?.variable?.value !== name));
        setIsSaving(true);
        try {
            await rpcClient.getBIDiagramRpcClient().removeClassOwnedNode({
                filePath: classFilePath,
                fieldName: name,
                classLineRange: agentClassModel.codedata.lineRange
            });
        } catch (error) {
            console.error(">>> agent definition: error deleting connection", error);
            setConnections(previous);
        } finally {
            setIsSaving(false);
        }
    };

    const renderConnectionIcon = (connection: FlowNode) => (
        <ConnectorIcon
            url={(connection.metadata as any)?.icon}
            style={{ width: 20, height: 20, fontSize: 20 }}
            fallbackIcon={<Icon name="bi-connection" sx={{ fontSize: 20 }} />}
            codedata={connection.codedata}
        />
    );

    const openFunctionFlow = async (func: FunctionModel) => {
        const lineRange = func?.codedata?.lineRange;
        if (!lineRange) return;
        const nodePosition: NodePosition = {
            startLine: lineRange.startLine.line, startColumn: lineRange.startLine.offset,
            endLine: lineRange.endLine.line, endColumn: lineRange.endLine.offset
        };
        await rpcClient.getVisualizerRpcClient().openView({
            type: EVENT_TYPE.OPEN_VIEW,
            location: {
                position: nodePosition,
                documentUri: fileName,
                type: type,
                identifier: func.name.value,
                artifactType: DIRECTORY_MAP.AGENT_DEFINITION
            }
        });
    };

    const renderToolIcon = (tool: ToolData) => {
        if (tool.type === "Agent") {
            if (tool.path) {
                return (
                    <ConnectorIcon
                        url={tool.path}
                        style={{ width: 20, height: 20, fontSize: 20 }}
                        fallbackIcon={<Icon name="bi-ai-agent" sx={{ fontSize: 20 }} />}
                        codedata={agentNode?.codedata}
                    />
                );
            }
            return <Icon name="bi-ai-agent" sx={{ fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                iconSx={{ fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            />;
        }
        if (tool.type === "MCP Server") {
            if (tool.path) {
                return (
                    <ConnectorIcon
                        url={tool.path}
                        style={{ width: 20, height: 20, fontSize: 20 }}
                        fallbackIcon={<Icon name="bi-mcp" sx={{ fontSize: 20 }} />}
                        codedata={agentNode?.codedata}
                    />
                );
            }
            return <Icon name="bi-mcp" sx={{ fontSize: 20 }} />;
        }
        if (tool.path) {
            return (
                <ConnectorIcon
                    url={tool.path}
                    style={{ width: 20, height: 20, fontSize: 20 }}
                    fallbackIcon={<Icon name="bi-function" sx={{ fontSize: 20 }} />}
                    codedata={agentNode?.codedata}
                />
            );
        }
        return <Icon name="bi-function" sx={{ fontSize: 20 }} />;
    };

    const role = promptText((agentNode?.properties as any)?.role?.value);
    const instructions = promptText((agentNode?.properties as any)?.instructions?.value);
    const settings = extractSettings(agentNode);
    const runFn = agentClassModel?.functions?.find((f) => f.kind === "DEFAULT" && f.name?.value === "run");
    const outputType = outputTypeOf(runFn?.returnType?.value);
    const outputTypeFields: FormField[] = runFn ? [{
        key: "returnType",
        label: "Response Type",
        type: "TYPE",
        optional: false,
        enabled: true,
        editable: true,
        advanced: false,
        documentation: "Define the type of value this agent returns when it completes.",
        value: outputType,
        types: (runFn.returnType?.types?.length ?? 0) > 0
            ? runFn.returnType.types.map((t, i) => (i === 0 ? { ...t, ballerinaType: outputType } : t))
            : [{ fieldType: "TYPE", selected: true, ballerinaType: outputType }],
    }] : [];

    const initFunction = agentClassModel?.functions?.find((f) => f.kind === "INIT");
    const initParameterNames = new Set(
        (initFunction?.parameters ?? [])
            .map((param) => param.name?.value)
            .filter((name): name is string => Boolean(name))
    );
    // An input's default lives on the init parameter, not the field, so pull it in for display/editing.
    const paramDefaults = new Map<string, string>();
    (initFunction?.parameters ?? []).forEach((param) => {
        const name = param.name?.value;
        const value = typeof param.defaultValue === "object" ? param.defaultValue?.value : param.defaultValue;
        if (name && value) {
            paramDefaults.set(name, value);
        }
    });
    const inputFields = (agentClassModel?.fields ?? [])
        .filter((field) => initParameterNames.has(field.name?.value ?? "")
            && !isModelProviderType(field.type?.value) && !isMemoryType(field.type?.value))
        .map((field) => {
            const def = paramDefaults.get(field.name?.value ?? "");
            return def && typeof field.defaultValue === "object"
                ? { ...field, defaultValue: { ...field.defaultValue, value: def } }
                : field;
        });
    const connectionDependencyReservedNames = Array.from(new Set([
        ...(agentClassModel?.fields ?? []).map((field) => field.name?.value),
        ...(initFunction?.parameters ?? []).map((param) => param.name?.value),
        ...(agentClassModel?.functions ?? []).map((func) => func.name?.value),
    ].filter((name): name is string => Boolean(name))));
    // Every class method except the constructor and the @ai:AgentTool methods (those live in Tools).
    // Includes the generated public API (run/trace) so the definition's contract is visible.
    const methods = (agentClassModel?.functions ?? []).filter(
        (f) => f.kind !== "INIT" && !agentTools.some((t) => t.name === f.name.value)
    );
    const hasAdvanced = Boolean(initFunction) || methods.length > 0;
    const toolPanelTitle = editingMcpNode ? "Edit MCP Server" : "Add Tool";

    return (
        <View>
            <TopNavigationBar projectPath={projectPath} />
            <TitleBar
                title="Agent Definition"
                subtitle="Configure your agent definition"
            />
            <ServiceContainer>
                {!agentClassModel && (
                    <LoadingContainer>
                        <ProgressRing />
                        <Typography variant="h3" sx={{ marginTop: '16px' }}>Loading Agent Definition...</Typography>
                    </LoadingContainer>
                )}
                {agentClassModel && (
                    <ScrollableSection>
                        <Section style={{ margin: "4px 0 0" }}>
                            <AgentInfoCard
                                borderRadius={4}
                                label={agentClassModel.name}
                                description={agentClassModel.documentation?.value}
                                onClick={() => openPanelUnlessSelecting("config")}
                                action={
                                    <IconButton
                                        title="Edit name and description"
                                        onClick={(e: React.MouseEvent) => { e.stopPropagation(); openPanel("config"); }}
                                    >
                                        <Icon name="bi-edit" sx={{ fontSize: 16 }} />
                                    </IconButton>
                                }
                            />
                        </Section>

                        <Section>
                            <SectionHeader>
                                <SectionTitle>Configuration</SectionTitle>
                            </SectionHeader>
                            <ConfigCard
                                clickable={Boolean(agentNode)}
                                title={agentNode ? "Edit role, instructions and settings" : undefined}
                                onClick={agentNode ? () => openPanelUnlessSelecting("agent") : undefined}
                            >
                                {agentNode && (
                                    <IconButton
                                        title="Edit role, instructions and settings"
                                        onClick={(e: React.MouseEvent) => { e.stopPropagation(); openPanel("agent"); }}
                                        style={{ position: "absolute", top: 8, right: 8 }}
                                    >
                                        <Icon name="bi-edit" sx={{ fontSize: 16 }} />
                                    </IconButton>
                                )}
                                <PromptField>
                                    <PromptLabel>Role</PromptLabel>
                                    {role
                                        ? <MarkdownContent clamp={2}><ReactMarkdown>{role}</ReactMarkdown></MarkdownContent>
                                        : <PlaceholderText>No role defined yet</PlaceholderText>}
                                </PromptField>
                                <PromptField>
                                    <PromptLabel>Instructions</PromptLabel>
                                    {instructions
                                        ? <MarkdownContent clamp={6}><ReactMarkdown>{instructions}</ReactMarkdown></MarkdownContent>
                                        : <PlaceholderText>No instructions defined yet</PlaceholderText>}
                                </PromptField>
                                {settings.length > 0 && (
                                    <StatRow>
                                        {settings.map((s) => (
                                            <Stat key={s.label}>
                                                <StatLabel>{s.label}</StatLabel>
                                                <StatValue>{s.value}</StatValue>
                                            </Stat>
                                        ))}
                                    </StatRow>
                                )}
                            </ConfigCard>
                        </Section>

                        <Section>
                            <SectionHeader>
                                <div>
                                    <SectionTitle>Tools</SectionTitle>
                                    <SectionDescription>Capabilities this agent can use to complete tasks.</SectionDescription>
                                </div>
                                <VSCodeButton appearance="primary" title="Add Tool" onClick={handleAddTool}>
                                    <Codicon name="add" sx={{ marginRight: 8 }} /> Tool
                                </VSCodeButton>
                            </SectionHeader>
                            <ScrollableContent>
                                {agentTools.map((tool: ToolData, index: number) => {
                                    const hasFlow = Boolean(agentClassModel?.functions?.some((f) => f.name.value === tool.name));
                                    const clickable = hasFlow || tool.type === "MCP Server";
                                    return (
                                        <Row key={index} clickable={clickable} onClick={clickable ? () => handleViewTool(tool) : undefined}>
                                            <RowInfo>
                                                <IconContainer>{renderToolIcon(tool)}</IconContainer>
                                                <ItemLabel>{tool.name}</ItemLabel>
                                            </RowInfo>
                                            <RowActions>
                                                {tool.type && (
                                                    <TypeBadge>
                                                        {tool.type === "MCP Server" ? "MCP Toolkit" : tool.type}
                                                    </TypeBadge>
                                                )}
                                                <IconButton
                                                    title="Delete tool"
                                                    onClick={(e: React.MouseEvent) => { e.stopPropagation(); handleDeleteTool(tool); }}
                                                >
                                                    <Codicon name="trash" />
                                                </IconButton>
                                            </RowActions>
                                        </Row>
                                    );
                                })}
                            </ScrollableContent>
                        </Section>

                        {connections.length > 0 && (
                            <Section>
                                <SectionHeader>
                                    <SectionTitle>Connections</SectionTitle>
                                </SectionHeader>
                                <ScrollableContent>
                                    {connections.map((connection: FlowNode, index: number) => (
                                        <Row key={index} clickable onClick={() => handleEditConnection(connection)}>
                                            <RowInfo>
                                                <IconContainer>{renderConnectionIcon(connection)}</IconContainer>
                                                <ItemLabel>{connection.properties?.variable?.value as string}</ItemLabel>
                                            </RowInfo>
                                            <RowActions>
                                                <IconButton
                                                    title="Delete connection"
                                                    onClick={(e: React.MouseEvent) => { e.stopPropagation(); handleDeleteConnection(connection); }}
                                                >
                                                    <Codicon name="trash" />
                                                </IconButton>
                                            </RowActions>
                                        </Row>
                                    ))}
                                </ScrollableContent>
                            </Section>
                        )}

                        <Section>
                            <SectionHeader>
                                <div>
                                    <SectionTitle>Response Type</SectionTitle>
                                    <SectionDescription>
                                        Define the type of value this agent returns when it completes.
                                    </SectionDescription>
                                </div>
                            </SectionHeader>
                            <ResponseTypeCard
                                clickable={Boolean(runFn)}
                                title={runFn ? "Edit response type" : undefined}
                                onClick={runFn ? () => openPanel("outputType") : undefined}
                            >
                                {outputType
                                    ? <ResponseTypeValue>{outputType}</ResponseTypeValue>
                                    : <PlaceholderText>Not set</PlaceholderText>}
                                {runFn && <Icon name="bi-edit" sx={{ fontSize: 16, color: ThemeColors.ON_SURFACE_VARIANT }} />}
                            </ResponseTypeCard>
                        </Section>

                        <Section>
                            <SectionHeader>
                                <div>
                                    <SectionTitle>Initialization Parameters</SectionTitle>
                                    <SectionDescription>
                                        Values provided to initialize an agent created from this definition.
                                    </SectionDescription>
                                </div>
                                <VSCodeButton data-testid="add-variable-button" appearance="primary" title="Add Parameter" onClick={() => handleAddVariable()}>
                                    <Codicon name="add" sx={{ marginRight: 8 }} /> Parameter
                                </VSCodeButton>
                            </SectionHeader>
                            <ScrollableContent>
                                {inputFields.map((field: FieldType, index: number) => (
                                    <VariableCard
                                        key={index}
                                        fieldModel={field}
                                        onEditVariable={() => handleEditVariable(field)}
                                        onDeleteVariable={() => handleDeleteVariable(field)}
                                        onVariableImplement={() => handleEditVariable(field)}
                                    />
                                ))}
                            </ScrollableContent>
                        </Section>

                        {hasAdvanced && (
                            <Section>
                                <AdvancedCard>
                                    <AdvancedHeader expanded={advancedOpen} onClick={() => setAdvancedOpen((v) => !v)}>
                                        <Codicon name={advancedOpen ? "chevron-down" : "chevron-right"} />
                                        <span>Advanced</span>
                                    </AdvancedHeader>
                                    {advancedOpen && (
                                        <AdvancedBody>
                                        {initFunction && (
                                            <InfoSection>
                                                <Icon name={'info'} isCodicon sx={{ marginRight: "8px" }} />
                                                <Typography variant="body3">Constructor:</Typography>
                                                <Typography variant="body3">
                                                    <LinkButton
                                                        sx={{ fontSize: 12, padding: 8, gap: 4 }}
                                                        onClick={() => openFunctionFlow(initFunction)}
                                                    >
                                                        {initFunction.name.value}
                                                    </LinkButton>
                                                </Typography>
                                            </InfoSection>
                                        )}
                                        {methods.length > 0 && (
                                            <>
                                                <SectionTitle>Methods</SectionTitle>
                                                {methods.map((func: FunctionModel, index: number) => (
                                                    <Row key={index} clickable onClick={() => openFunctionFlow(func)}>
                                                        <RowInfo>
                                                            <IconContainer><Icon name="bi-function" sx={{ fontSize: 20 }} /></IconContainer>
                                                            <ItemLabel>{func.name.value}</ItemLabel>
                                                        </RowInfo>
                                                    </Row>
                                                ))}
                                            </>
                                        )}
                                        </AdvancedBody>
                                    )}
                                </AdvancedCard>
                            </Section>
                        )}
                    </ScrollableSection>
                )}
                {panelKind && (
                    <PanelContainer
                        key={panelSeq}
                        title={
                            panelKind === "config" ? "Edit Agent Definition"
                                : panelKind === "agent" ? "Edit Configuration"
                                    : panelKind === "tool" ? toolPanelTitle
                                        : panelKind === "variable" ? (isNew ? "Add Variable" : "Edit Variable")
                                            : panelKind === "connection" ? "Edit Connection"
                                                : panelKind === "outputType" ? "Edit Response Type"
                                                    : ""
                        }
                        show={panelOpen}
                        onClose={handleClosePanel}
                        onBack={
                            panelKind === "tool"
                                ? (toolPanel === "MENU"
                                    ? handleClosePanel
                                    : (toolPanelBack ?? (() => { setToolPanelBack(null); setToolPanel("MENU"); })))
                                : handleClosePanel
                        }
                        width={400}
                    >
                        {panelKind === "config" && agentClassModel && configFields.length > 0 && (
                            <ArtifactForm
                                fileName={classFilePath}
                                targetLineRange={{
                                    startLine: { line: position.startLine, offset: position.startColumn },
                                    endLine: { line: position.endLine, offset: position.endColumn }
                                }}
                                fields={configFields}
                                onSubmit={handleConfigSubmit}
                                isSaving={isSaving}
                            />
                        )}
                        {panelKind === "agent" && agentNode && (
                            <FlowNodeForm
                                fileName={classFilePath}
                                node={agentNode}
                                nodeFormTemplate={agentNode}
                                targetLineRange={agentNode.codedata?.lineRange as any}
                                projectPath={projectPath}
                                editForm={true}
                                onSubmit={handleSubmitAgent}
                                submitText={isSaving ? "Saving..." : "Save"}
                                showProgressIndicator={isSaving}
                                disableSaveButton={isSaving}
                                fieldOverrides={{ model: { hidden: true }, type: { hidden: true }, variable: { hidden: true } }}
                            />
                        )}
                        {panelKind === "tool" && agentNode && agentClassModel && (
                            <>
                                {toolPanel === "MENU" && (
                                    <AddTool
                                        agentNode={agentNode}
                                        onCreateCustomTool={() => { setToolPanelBack(null); setToolPanel("CUSTOM"); }}
                                        onUseConnection={() => { setToolPanelBack(null); setToolPanel("CONNECTION"); }}
                                        onUseFunction={() => { setToolPanelBack(null); setToolPanel("FUNCTION"); }}
                                        onUseMcpServer={() => { setToolPanelBack(null); setToolPanel("MCP"); }}
                                        onUseAgent={openAgentToolPopup}
                                    />
                                )}
                                {toolPanel === "CUSTOM" && (
                                    <AgentToolForm
                                        filePath={classFilePath}
                                        projectPath={projectPath}
                                        hostClass={{ className: agentClassModel.name, filePath: classFilePath }}
                                        targetLineRange={{
                                            startLine: { line: position.startLine, offset: position.startColumn },
                                            endLine: { line: position.endLine, offset: position.endColumn }
                                        }}
                                        onSave={handleToolSaved}
                                        onBack={() => setToolPanel("MENU")}
                                    />
                                )}
                                {(toolPanel === "CONNECTION" || toolPanel === "FUNCTION") && (
                                    <AIAgentSidePanel
                                        agentNode={agentNode}
                                        projectPath={projectPath}
                                        mode={toolPanel === "CONNECTION" ? NewToolSelectionMode.CONNECTION : NewToolSelectionMode.FUNCTION}
                                        onSubmit={handleToolSubmit}
                                        onViewChange={(_view, navigateBack) => setToolPanelBack(() => navigateBack ?? null)}
                                        onCancel={() => { setToolPanelBack(null); setToolPanel("MENU"); }}
                                        connectionDependency={toolPanel === "CONNECTION" ? {
                                            className: agentClassModel.name,
                                            filePath: classFilePath,
                                            classLineRange: agentClassModel.codedata.lineRange,
                                            inputNames: inputFields.map((f) => f.name?.value).filter((n): n is string => Boolean(n)),
                                            connectionFieldNames: (agentClassModel.fields ?? [])
                                                .filter((field) => !isInnerAgentField(field) && !isAgentTypedField(field))
                                                .map((field) => field.name?.value)
                                                .filter((name): name is string => Boolean(name)),
                                            connectionOrigins: Object.fromEntries((agentClassModel.fields ?? [])
                                                .filter((field) => !isInnerAgentField(field) && !isAgentTypedField(field))
                                                .map((field) => [
                                                    field.name?.value,
                                                    initParameterNames.has(field.name?.value ?? "") ? "dependency" : "agent",
                                                ])
                                                .filter(([name]) => Boolean(name))) as Record<string, "dependency" | "agent">,
                                            reservedNames: connectionDependencyReservedNames,
                                        } : undefined}
                                    />
                                )}
                                {toolPanel === "MCP" && (
                                    <AddMcpServer
                                        agentNode={agentNode}
                                        agentDefinition={{
                                            filePath: classFilePath,
                                            classLineRange: agentClassModel.codedata.lineRange,
                                            reservedNames: connectionDependencyReservedNames,
                                        }}
                                        editMode={Boolean(editingMcpNode)}
                                        name={editingMcpNode?.properties?.variable?.value as string}
                                        existingNode={editingMcpNode}
                                        onSave={handleToolSaved}
                                        onBack={() => editingMcpNode ? handleCloseToolPanel() : setToolPanel("MENU")}
                                    />
                                )}
                            </>
                        )}
                        {panelKind === "connection" && editingConnection && (
                            <ConnectionConfigView
                                fileName={classFilePath}
                                selectedNode={editingConnection}
                                submitText={isSaving ? "Saving..." : "Save"}
                                isSaving={isSaving}
                                onSubmit={handleConnectionSave}
                            />
                        )}
                        {panelKind === "variable" && editingVariable && agentClassModel && (
                            <VariableForm
                                model={editingVariable}
                                filePath={classFilePath}
                                lineRange={editingVariable.codedata.lineRange}
                                onClose={handleCloseVariableForm}
                                isSaving={isSaving}
                                onSave={handleVariableSave}
                            />
                        )}
                        {panelKind === "outputType" && agentClassModel && outputTypeFields.length > 0 && (
                            <ArtifactForm
                                fileName={classFilePath}
                                targetLineRange={agentClassModel.codedata.lineRange as any}
                                fields={outputTypeFields}
                                onSubmit={handleOutputTypeSave}
                                submitText={isSaving ? "Saving..." : "Save"}
                                isSaving={isSaving}
                                hideInfoBanner
                            />
                        )}
                    </PanelContainer>
                )}
                {agentToolPopupOpen && agentClassModel && (
                    <AgentDefinitionAgentToolForm
                        filePath={classFilePath}
                        reservedNames={connectionDependencyReservedNames}
                        projectPath={projectPath}
                        classLineRange={agentClassModel.codedata.lineRange}
                        hostClass={{ className: agentClassModel.name, filePath: classFilePath }}
                        onSave={handleToolSaved}
                        onCancel={() => setAgentToolPopupOpen(false)}
                    />
                )}
                {panelOpen && <Overlay onClose={handleClosePanel} sx={{ background: "rgba(0, 0, 0, 0.2)" }} />}
            </ServiceContainer>
        </View>
    );
}
