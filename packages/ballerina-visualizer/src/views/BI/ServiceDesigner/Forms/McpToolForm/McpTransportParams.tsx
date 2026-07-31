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
// tslint:disable: jsx-no-multiline-js

import { useState } from "react";
import styled from "@emotion/styled";
import { CheckBox, Codicon, Divider, LinkButton, ThemeColors, Typography } from "@wso2/ui-toolkit";
import { ParameterModel } from "@wso2/ballerina-core";
import { ParamItem } from "../ResourceForm/Parameters/ParamItem";
import { ParamEditor } from "../ResourceForm/Parameters/ParamEditor";

// Fills the form column instead of shrink-wrapping to content. Without this, the enclosing
// CategoryRow (align-items: flex-start) lets the section shrink when collapsed, which slides the
// Expand/Collapse button leftwards.
const Container = styled.div`
    width: 100%;
    box-sizing: border-box;
`;

const AddButtonWrapper = styled.div`
    margin: 8px 0;
`;

const AdvancedConfigRow = styled.div`
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    margin-bottom: 8px;
    margin-top: 12px;
`;

const AdvancedConfigButtonContainer = styled.div`
    display: flex;
    flex-direction: row;
    flex-grow: 1;
    justify-content: flex-end;
`;

const AdvancedContent = styled.div`
    margin-top: 8px;
`;

const SectionCaption = styled.div`
    color: var(--vscode-list-deemphasizedForeground);
    font-size: 12px;
    margin: 2px 0 12px 0;
    user-select: text;
`;

const SubLabel = styled.div`
    color: var(--vscode-descriptionForeground);
    font-size: 13px;
    font-weight: 500;
    margin: 12px 0 6px 0;
`;

const CheckBoxRow = styled.div`
    margin-bottom: 8px;
`;

// Description shown under each advanced toggle. Rendered here (rather than via the CheckBox's own
// `sx.description`) so it shares the panel background instead of the CheckBox's editor-background box.
const ParamDescription = styled.div`
    color: var(--vscode-list-deemphasizedForeground);
    font-size: 13px;
    padding: 2px 0 0 24px;
    user-select: text;
`;

// The raw transport types an MCP tool on a Streamable HTTP service may bind, in canonical display
// order. Caller is intentionally excluded — the mcp compiler plugin does not allow it in tool
// methods. Labels and descriptions come from the language server model (mcp_tool.json), not here.
const MCP_ADVANCED_TYPES: string[] = ["http:Request", "http:Headers"];

export function isMcpAdvancedType(typeValue?: string): boolean {
    return typeValue !== undefined && MCP_ADVANCED_TYPES.includes(typeValue);
}

export function isMcpHeaderParam(param: ParameterModel): boolean {
    return param.httpParamType === "HEADER";
}

// mcp:Meta? is an MCP-level (not transport) param: it must be nilable and the last parameter.
// mcp:Session must be the first parameter. Both apply to all MCP tools, not just Streamable HTTP.
export function isMcpMetaParam(param: ParameterModel): boolean {
    return (param.type?.value ?? "").replace(/\s/g, "").startsWith("mcp:Meta");
}

export function isMcpSessionParam(param: ParameterModel): boolean {
    return (param.type?.value ?? "").replace(/\s/g, "").startsWith("mcp:Session");
}

// The advanced/meta params are seeded by the language server (mcp_tool.json for new tools, read-back
// enrichment for existing ones), which also supplies each param's label/description metadata. These
// helpers only locate them in the model and apply canonical ordering — they never synthesize a param
// shape or its display text.

// The [Request, Headers] toggles present in the model, in canonical order.
export function deriveMcpAdvancedParams(params: ParameterModel[]): ParameterModel[] {
    return MCP_ADVANCED_TYPES
        .map((type) => params.find((p) => p.type?.value === type))
        .filter((param): param is ParameterModel => param !== undefined);
}

// The mcp:Meta? toggle from the model, or undefined if the model carries no meta seed.
export function deriveMcpMetaParam(params: ParameterModel[]): ParameterModel | undefined {
    return params.find(isMcpMetaParam);
}

export interface McpTransportParamsProps {
    // Whether to show the Transport Parameters subsection (only for mcp:StreamableHttpService).
    showTransport: boolean;
    // The mcp:Meta? toggle from the model, or undefined if the model carries no meta seed.
    metaParam: ParameterModel | undefined;
    onMetaChange: (param: ParameterModel) => void;
    headerSchema: ParameterModel;
    headerParams: ParameterModel[];
    advancedParams: ParameterModel[];
    onHeaderParamsChange: (params: ParameterModel[]) => void;
    onAdvancedParamsChange: (params: ParameterModel[]) => void;
}

export function McpTransportParams(props: McpTransportParamsProps) {
    const {
        showTransport, metaParam, onMetaChange,
        headerSchema, headerParams, advancedParams, onHeaderParamsChange, onAdvancedParamsChange
    } = props;

    const [editModel, setEditModel] = useState<ParameterModel>(undefined);
    const [isNew, setIsNew] = useState<boolean>(false);
    const [editingIndex, setEditingIndex] = useState<number>(-1);
    // Collapsed by default; auto-expand when the tool already binds any advanced param so it's visible.
    const [expanded, setExpanded] = useState<boolean>(
        !!metaParam?.enabled || headerParams.length > 0 || advancedParams.some((param) => param.enabled)
    );

    const onAddHeaderClick = () => {
        const newHeader = structuredClone(headerSchema);
        newHeader.httpParamType = "HEADER";
        newHeader.enabled = true;
        newHeader.name.value = "";
        if (newHeader.headerName) {
            newHeader.headerName.value = "";
        }
        setEditModel(newHeader);
        setIsNew(true);
        setEditingIndex(-1);
    };

    const onEditHeader = (param: ParameterModel) => {
        setIsNew(false);
        setEditModel(param);
        setEditingIndex(headerParams.indexOf(param));
    };

    const onChangeHeader = (param: ParameterModel) => {
        setEditModel(param);
        if (!isNew && editingIndex >= 0) {
            const updated = [...headerParams];
            updated[editingIndex] = param;
            onHeaderParamsChange(updated);
        }
    };

    const onSaveHeader = (param: ParameterModel) => {
        param.enabled = true;
        param.httpParamType = "HEADER";
        if (isNew) {
            onHeaderParamsChange([...headerParams, param]);
        } else if (editingIndex >= 0) {
            const updated = [...headerParams];
            updated[editingIndex] = param;
            onHeaderParamsChange(updated);
        }
        setEditModel(undefined);
        setEditingIndex(-1);
        setIsNew(false);
    };

    const onDeleteHeader = (param: ParameterModel) => {
        onHeaderParamsChange(headerParams.filter((p) => p !== param));
        setEditModel(undefined);
        setEditingIndex(-1);
    };

    const onCancelHeader = () => {
        setEditModel(undefined);
        setEditingIndex(-1);
        setIsNew(false);
    };

    const onAdvancedChecked = (param: ParameterModel, checked: boolean) => {
        const updated = advancedParams.map((p) => {
            if (p.metadata?.label !== param.metadata?.label) {
                return p;
            }
            const next = { ...p, enabled: checked };
            if (checked && !next.name?.value) {
                next.name = { ...next.name, value: param.metadata.label.toLowerCase() };
            }
            return next;
        });
        onAdvancedParamsChange(updated);
    };

    return (
        <Container>
            <AdvancedConfigRow>
                Advanced Configurations
                <AdvancedConfigButtonContainer>
                    <LinkButton
                        onClick={() => setExpanded(!expanded)}
                        sx={{ fontSize: 12, padding: 8, color: ThemeColors.PRIMARY, gap: 4, userSelect: "none" }}
                    >
                        <Codicon name={expanded ? "chevron-up" : "chevron-down"} iconSx={{ fontSize: 12 }} sx={{ height: 12 }} />
                        {expanded ? "Collapse" : "Expand"}
                    </LinkButton>
                </AdvancedConfigButtonContainer>
            </AdvancedConfigRow>

            {expanded && (
                <AdvancedContent>
                    {/* Metadata — an MCP-level param, available for all MCP tools */}
                    {metaParam && (
                        <CheckBoxRow>
                            <CheckBox
                                label={metaParam.metadata?.label}
                                checked={metaParam.enabled}
                                onChange={(checked) => onMetaChange({ ...metaParam, enabled: checked })}
                            />
                            <ParamDescription>{metaParam.metadata?.description}</ParamDescription>
                        </CheckBoxRow>
                    )}

                    {showTransport && (
                        <>
                            <Typography sx={{ marginBlockEnd: 2, marginBlockStart: 12 }} variant="h4">Transport Parameters</Typography>
                            <SectionCaption>
                                Access transport-level request data.
                            </SectionCaption>

                            {/* Headers */}
                            <SubLabel>HTTP Headers</SubLabel>
                            {headerParams.map((param, index) => (
                                <ParamItem
                                    key={`mcp-header-${index}`}
                                    param={param}
                                    onDelete={onDeleteHeader}
                                    onEditClick={onEditHeader}
                                />
                            ))}
                            {editModel && editModel.httpParamType === "HEADER" && (
                                <ParamEditor
                                    isNew={isNew}
                                    param={editModel}
                                    onChange={onChangeHeader}
                                    onSave={onSaveHeader}
                                    onCancel={onCancelHeader}
                                    type="HEADER"
                                />
                            )}
                            <AddButtonWrapper>
                                <LinkButton
                                    sx={editModel ? { opacity: 0.5, pointerEvents: "none" } : {}}
                                    onClick={editModel ? undefined : onAddHeaderClick}
                                >
                                    <Codicon name="add" />
                                    <>Header</>
                                </LinkButton>
                            </AddButtonWrapper>

                            {/* Raw transport parameter toggles */}
                            <SubLabel>Request Access</SubLabel>
                            {advancedParams.map((param, index) => (
                                <CheckBoxRow key={`mcp-advanced-${index}`}>
                                    <CheckBox
                                        label={param.metadata?.label}
                                        checked={param.enabled}
                                        onChange={(checked) => onAdvancedChecked(param, checked)}
                                    />
                                    <ParamDescription>{param.metadata?.description}</ParamDescription>
                                </CheckBoxRow>
                            ))}
                        </>
                    )}
                </AdvancedContent>
            )}
            <Divider />
        </Container>
    );
}
