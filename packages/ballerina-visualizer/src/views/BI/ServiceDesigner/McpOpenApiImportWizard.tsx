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

import { useEffect, useState } from "react";
import styled from "@emotion/styled";
import { Button, CheckBox, Codicon, Icon, Stepper, TextField, ThemeColors, Typography } from "@wso2/ui-toolkit";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { FormField, FormImports, FormValues } from "@wso2/ballerina-side-panel";
import { LineRange, McpServiceDefaults, McpToolEndpoint, RecordTypeField, ServiceInitModel, ValidationResult } from "@wso2/ballerina-core";
import { FormHeader } from "../../../components/FormHeader";
import { RelativeLoader } from "../../../components/RelativeLoader";
import ArtifactForm from "../Forms/ArtifactForm";
import { getColorByMethod } from "../../../utils/utils";
import { applyFormValuesToModel, mapPropertiesToFormFields } from "./serviceInitModelUtils";
import { BODY_FONT_SIZE, CONTENT_INSET, HeaderWrapper, NestedFormWrapper, StatusCard, StatusText } from "./ServiceCreationLayout";

const SelectionContainer = styled.div`
    padding-bottom: 100px;
`;

const SelectionBody = styled.div`
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 0 ${CONTENT_INSET}px;
    margin-top: 16px;
`;

const ImportStepperWrapper = styled.div`
    padding: 0 ${CONTENT_INSET}px;
    margin-bottom: 8px;
`;

const SpecFileBadge = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 ${CONTENT_INSET}px;
    margin-top: 8px;
    font-size: ${BODY_FONT_SIZE};
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    font-family: monospace;
    line-height: 16px;
`;

const Toolbar = styled.div`
    display: flex;
    flex-direction: column;
    gap: 10px;
`;

const ToolbarRow = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
`;

const MethodFilters = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
`;

const MethodChip = styled.button<{ active: boolean; color: string }>`
    border: 1px solid ${(p: { active: boolean; color: string }) => p.active ? p.color : ThemeColors.OUTLINE_VARIANT};
    background-color: ${(p: { active: boolean; color: string }) => p.active ? p.color : "transparent"};
    color: ${(p: { active: boolean; color: string }) => p.active ? "#fff" : ThemeColors.ON_SURFACE_VARIANT};
    border-radius: 4px;
    padding: 3px 10px;
    font-size: 11px;
    font-weight: bold;
    font-family: monospace;
    text-transform: uppercase;
    cursor: pointer;
`;

const SelectionSummary = styled.div`
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    font-size: ${BODY_FONT_SIZE};
`;

const EndpointList = styled.div`
    display: flex;
    flex-direction: column;
    border: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    border-radius: 6px;
    max-height: 340px;
    overflow-y: auto;
`;

// Small gap: the label-less CheckBox still reserves its empty label slot.
const EndpointRow = styled.div`
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 10px 14px;
    cursor: pointer;
    border-bottom: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    &:last-child { border-bottom: none; }
    &:hover { background-color: ${ThemeColors.SURFACE_CONTAINER}; }
`;

const EndpointMeta = styled.div`
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
    flex: 1;
`;

// Fixed min-width so the paths line up in a column.
const MethodPill = styled.span<{ color: string }>`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    min-width: 56px;
    padding: 3px 7px;
    border-radius: 4px;
    background-color: ${(p: { color: string }) => p.color};
    color: #fff;
    font-weight: bold;
    font-size: 11px;
    font-family: monospace;
    text-transform: uppercase;
`;

const EndpointPath = styled.span`
    min-width: 0;
    max-width: 50%;
    flex: 0 1 auto;
    font-family: monospace;
    font-size: 13px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

const EndpointDesc = styled.span`
    min-width: 0;
    flex: 1;
    font-size: ${BODY_FONT_SIZE};
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

const EmptyMessage = styled.div`
    padding: 24px;
    text-align: center;
    font-size: ${BODY_FONT_SIZE};
    color: ${ThemeColors.ON_SURFACE_VARIANT};
`;

const SelectionActions = styled.div`
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 8px;
`;

interface McpImportConfiguration {
    serviceName: string;
    version: string;
    basePath: string;
    port: string;
    listenerName: string;
}

function toMcpImportConfiguration(defaults: McpServiceDefaults): McpImportConfiguration {
    return {
        serviceName: defaults.serviceName,
        version: defaults.version,
        basePath: defaults.basePath,
        port: String(defaults.port),
        listenerName: defaults.listenerName,
    };
}

function applyMcpImportConfiguration(serviceModel: ServiceInitModel, config: McpImportConfiguration): ServiceInitModel {
    const properties = serviceModel.properties;
    if (properties.serviceName) properties.serviceName.value = config.serviceName;
    if (properties.version) properties.version.value = config.version;
    if (properties.basePath) properties.basePath.value = config.basePath;
    if (properties.listenTo) properties.listenTo.value = config.port;
    if (properties.listenerVarName) properties.listenerVarName.value = config.listenerName;
    return serviceModel;
}

type WizardStep = "configure" | "tools";

const IMPORT_STEPS = ["Configure", "Tools"];

export interface McpOpenApiImportWizardProps {
    /** The service model after the Source step's form values (incl. the chosen spec path) were applied. */
    initialModel: ServiceInitModel;
    specPath: string;
    filePath: string;
    targetLineRange: LineRange;
    recordTypeFields: RecordTypeField[];
    isSaving: boolean;
    serverValidationErrors: ValidationResult[];
    /** Return to the Source step, discarding this wizard's in-progress state. */
    onBack: () => void;
    onCreate: (model: ServiceInitModel) => void | Promise<void>;
}

export function McpOpenApiImportWizard(props: McpOpenApiImportWizardProps) {
    const { initialModel, specPath, filePath, targetLineRange, recordTypeFields, isSaving, serverValidationErrors,
        onBack, onCreate } = props;
    const { rpcClient } = useRpcContext();

    const [step, setStep] = useState<WizardStep>("configure");
    // Cloned so edits here don't leak into ServiceCreationView's own model state.
    const [model, setModel] = useState<ServiceInitModel>(() => structuredClone(initialModel));
    const [formFields, setFormFields] = useState<FormField[]>([]);
    const [endpoints, setEndpoints] = useState<McpToolEndpoint[]>([]);
    const [selectedTools, setSelectedTools] = useState<Set<string>>(new Set());
    const [toolSearch, setToolSearch] = useState("");
    const [methodFilters, setMethodFilters] = useState<Set<string>>(new Set());
    const [loadingEndpoints, setLoadingEndpoints] = useState(true);
    const [endpointError, setEndpointError] = useState("");

    useEffect(() => {
        let isMounted = true;
        rpcClient.getServiceDesignerRpcClient().listOpenApiEndpoints({ specPath })
            .then((res) => {
                if (!isMounted) return;
                if (res.errorMsg) {
                    setEndpointError(res.errorMsg);
                    return;
                }
                const modelWithDefaults = res.defaults
                    ? applyMcpImportConfiguration(model, toMcpImportConfiguration(res.defaults))
                    : model;
                setEndpoints(res.endpoints);
                setSelectedTools(new Set(res.endpoints.map((endpoint) => endpoint.toolName)));
                setModel(modelWithDefaults);
                setFormFields(mapPropertiesToFormFields(modelWithDefaults.properties));
            })
            .catch((error) => {
                if (isMounted) {
                    setEndpointError(error instanceof Error ? error.message : String(error));
                }
            })
            .finally(() => {
                if (isMounted) setLoadingEndpoints(false);
            });
        return () => {
            isMounted = false;
        };
        // Runs once per mounted wizard instance; specPath is fixed for its lifetime.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleConfigSubmit = (data: FormValues, formImports: FormImports) => {
        const configFields = formFields.filter((field) => field.key !== "designApproach");
        setModel(applyFormValuesToModel(configFields, model, data, formImports));
        setStep("tools");
    };

    const toggleTool = (toolName: string, checked: boolean) => {
        setSelectedTools((previous) => {
            const next = new Set(previous);
            checked ? next.add(toolName) : next.delete(toolName);
            return next;
        });
    };

    const toggleMethodFilter = (method: string) => {
        setMethodFilters((previous) => {
            const next = new Set(previous);
            next.has(method) ? next.delete(method) : next.add(method);
            return next;
        });
    };

    const handleConfirmSelection = async () => {
        await onCreate({ ...model, selectedTools: Array.from(selectedTools) });
    };

    const distinctMethods = Array.from(new Set(endpoints.map((endpoint) => endpoint.method.toUpperCase())));
    const query = toolSearch.trim().toLowerCase();
    const filteredEndpoints = endpoints.filter((endpoint) =>
        (methodFilters.size === 0 || methodFilters.has(endpoint.method.toUpperCase()))
        && (!query || endpoint.path.toLowerCase().includes(query)
            || endpoint.toolName.toLowerCase().includes(query)
            || endpoint.method.toLowerCase().includes(query)
            || endpoint.description?.toLowerCase().includes(query)));

    // Scoped to the filtered set so it doesn't silently touch hidden rows.
    const allSelected = filteredEndpoints.length > 0
        && filteredEndpoints.every((endpoint) => selectedTools.has(endpoint.toolName));
    const toggleAll = (checked: boolean) => {
        setSelectedTools((previous) => {
            const next = new Set(previous);
            filteredEndpoints.forEach((endpoint) => checked ? next.add(endpoint.toolName) : next.delete(endpoint.toolName));
            return next;
        });
    };

    const specFileName = specPath.split(/[\\/]/).pop();

    const specBadge = (
        <SpecFileBadge title={specPath}>
            <Codicon name="file-code" sx={{ display: "flex", alignItems: "center", justifyContent: "center", cursor: "default" }} iconSx={{ fontSize: 13 }} />
            {specFileName}
        </SpecFileBadge>
    );

    return (
        <SelectionContainer>
            <ImportStepperWrapper>
                <Stepper steps={IMPORT_STEPS} currentStep={step === "configure" ? 0 : 1} alignment="flex-start" />
            </ImportStepperWrapper>
            {step === "configure" ? (
                <>
                    <HeaderWrapper>
                        <FormHeader
                            title={`Configure ${model.displayName} from OpenAPI Spec`}
                            subtitle="Review and adjust the service details generated from your OpenAPI specification."
                        />
                    </HeaderWrapper>
                    {specBadge}
                    {loadingEndpoints ? (
                        <RelativeLoader message="Reading OpenAPI specification..." />
                    ) : endpointError ? (
                        <StatusCard>
                            <Icon name="bi-error" sx={{ color: ThemeColors.ERROR, fontSize: "18px" }} />
                            <StatusText variant="body2">{endpointError}</StatusText>
                            <Button appearance="secondary" onClick={onBack}>Back</Button>
                        </StatusCard>
                    ) : (
                        <NestedFormWrapper>
                            <ArtifactForm
                                fileName={filePath}
                                targetLineRange={targetLineRange}
                                fields={formFields.filter((field) => field.key !== "designApproach")}
                                isSaving={false}
                                nestedForm={true}
                                onSubmit={handleConfigSubmit}
                                onBack={onBack}
                                cancelText="Back"
                                serverValidationErrors={serverValidationErrors}
                                preserveFieldOrder={true}
                                recordTypeFields={recordTypeFields}
                                submitText="Next"
                            />
                        </NestedFormWrapper>
                    )}
                </>
            ) : (
                <>
                    <HeaderWrapper>
                        <FormHeader
                            title="Select Tools to Expose"
                            subtitle="Each selected operation becomes an MCP tool that proxies requests to the underlying REST API."
                        />
                    </HeaderWrapper>
                    {specBadge}
                    {loadingEndpoints ? (
                        <RelativeLoader message="Reading OpenAPI specification..." />
                    ) : endpointError ? (
                        <StatusCard>
                            <Icon name="bi-error" sx={{ color: ThemeColors.ERROR, fontSize: "18px" }} />
                            <StatusText variant="body2">{endpointError}</StatusText>
                        </StatusCard>
                    ) : (
                        <SelectionBody>
                            <Toolbar>
                                <TextField
                                    placeholder="Search operations..."
                                    value={toolSearch}
                                    onTextChange={setToolSearch}
                                    icon={{ iconComponent: <Codicon name="search" />, position: "start" }}
                                    sx={{ width: "100%" }}
                                />
                                <ToolbarRow>
                                    <MethodFilters>
                                        {distinctMethods.map((method) => (
                                            <MethodChip
                                                key={method}
                                                active={methodFilters.has(method)}
                                                color={getColorByMethod(method)}
                                                onClick={() => toggleMethodFilter(method)}
                                            >
                                                {method}
                                            </MethodChip>
                                        ))}
                                    </MethodFilters>
                                    <CheckBox
                                        label={allSelected ? "Deselect all" : "Select all"}
                                        value="select-all"
                                        checked={allSelected}
                                        onChange={toggleAll}
                                    />
                                </ToolbarRow>
                            </Toolbar>
                            <SelectionSummary>Selected {selectedTools.size} out of {endpoints.length} tools</SelectionSummary>
                            <EndpointList>
                                {filteredEndpoints.length === 0 ? (
                                    <EmptyMessage>No operations match your search.</EmptyMessage>
                                ) : filteredEndpoints.map((endpoint) => (
                                    <EndpointRow
                                        key={endpoint.toolName}
                                        onClick={() => toggleTool(endpoint.toolName, !selectedTools.has(endpoint.toolName))}
                                    >
                                        <span onClick={(event) => event.stopPropagation()}>
                                            <CheckBox
                                                label=""
                                                value={endpoint.toolName}
                                                checked={selectedTools.has(endpoint.toolName)}
                                                onChange={(checked: boolean) => toggleTool(endpoint.toolName, checked)}
                                            />
                                        </span>
                                        <EndpointMeta>
                                            <MethodPill color={getColorByMethod(endpoint.method)}>{endpoint.method}</MethodPill>
                                            <EndpointPath>{endpoint.path}</EndpointPath>
                                            {endpoint.description && <EndpointDesc>{endpoint.description}</EndpointDesc>}
                                        </EndpointMeta>
                                    </EndpointRow>
                                ))}
                            </EndpointList>
                            {serverValidationErrors.length > 0 && (
                                <StatusCard>
                                    <Icon name="bi-error" sx={{ color: ThemeColors.ERROR, fontSize: "18px" }} />
                                    <StatusText variant="body2">
                                        {serverValidationErrors.map((validationError) => validationError.message).join(" ")}
                                    </StatusText>
                                </StatusCard>
                            )}
                            <SelectionActions>
                                <Button appearance="secondary" onClick={() => setStep("configure")} disabled={isSaving}>Back</Button>
                                <Button appearance="primary" onClick={handleConfirmSelection} disabled={isSaving || selectedTools.size === 0}>
                                    {isSaving ? (
                                        <Typography variant="progress">Creating...</Typography>
                                    ) : (
                                        `Create with ${selectedTools.size} tool${selectedTools.size === 1 ? "" : "s"}`
                                    )}
                                </Button>
                            </SelectionActions>
                        </SelectionBody>
                    )}
                </>
            )}
        </SelectionContainer>
    );
}
