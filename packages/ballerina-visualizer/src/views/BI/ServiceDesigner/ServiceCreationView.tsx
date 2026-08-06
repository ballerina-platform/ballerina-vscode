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

import { Button, CheckBox, Codicon, Icon, LinkButton, TextField, ThemeColors, Typography, View, ViewContent } from "@wso2/ui-toolkit";
import { TopNavigationBar } from "../../../components/TopNavigationBar";
import { useEffect, useRef, useState } from "react";
import { TitleBar } from "../../../components/TitleBar";
import { isBetaModule } from "../ComponentListView/componentListUtils";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { FormField, FormImports, FormValues } from "@wso2/ballerina-side-panel";
import { EVENT_TYPE, hasBlockingValidationErrors, LineRange, McpServiceDefaults, McpToolEndpoint, RecordTypeField, ServiceInitModel, ValidationResult } from "@wso2/ballerina-core";
import { FormHeader } from "../../../components/FormHeader";
import ArtifactForm from "../Forms/ArtifactForm";
import styled from "@emotion/styled";
import { getColorByMethod } from "../../../utils/utils";
import { DownloadIcon } from "../../../components/DownloadIcon";
import { RelativeLoader } from "../../../components/RelativeLoader";
import {
    applyFormValuesToModel,
    collectRecordTypeFields,
    mapPropertiesToFormFields,
    updateChoiceInModel,
} from "./serviceInitModelUtils";

const Container = styled.div`
    display: flex;
    flex-direction: column;
    gap: 10;
    margin: 20px;
    max-width: 600px;
    height: 100%;
`;

// Every step lines up on CONTENT_INSET. The nested ArtifactForm already pads its own content
// by NESTED_FORM_INSET, so it only needs the difference.
const CONTENT_INSET = 16;
const NESTED_FORM_INSET = 5;
const BODY_FONT_SIZE = "13px";

const FormContainer = styled.div`
    padding-bottom: 100px;
`;

const NestedFormWrapper = styled.div`
    padding: 0 ${CONTENT_INSET - NESTED_FORM_INSET}px;
`;

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

const StatusContainer = styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100%;
`;

const StatusCard = styled.div`
    margin: 16px 16px 0 16px;
    padding: 16px;
    border-radius: 8px;
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 16px;

    & > svg {
        font-size: 24px;
        color: ${ThemeColors.ON_SURFACE};
    }
`;

const StatusText = styled(Typography)`
    color: ${ThemeColors.ON_SURFACE};
`;

// FormHeader ships its own inset and a 14px (body2) subtitle; normalise both.
const HeaderWrapper = styled.div`
    padding: 0 ${CONTENT_INSET}px;
    & > div { padding: 0; }
    & p { font-size: ${BODY_FONT_SIZE}; }
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

const AdvancedConfigurationRow = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: ${BODY_FONT_SIZE};
`;

const AdvancedFields = styled.div`
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
`;

const AdvancedField = styled.div<{ fullWidth?: boolean }>`
    min-width: 0;
    grid-column: ${(p: { fullWidth?: boolean }) => p.fullWidth ? "1 / -1" : "auto"};
`;


export interface ServiceCreationViewProps {
    projectPath: string;
    orgName: string;
    packageName: string;
    moduleName: string;
    version?: string;
    isLocalRepository?: boolean;
}

interface HeaderInfo {
    title: string;
    moduleName: string;
}

interface McpImportConfiguration {
    serviceName: string;
    version: string;
    basePath: string;
    port: string;
    listenerName: string;
}

enum PullingStatus {
    FETCHING = "fetching",
    PULLING = "pulling",
    SUCCESS = "success",
    ERROR = "error",
}

export function ServiceCreationView(props: ServiceCreationViewProps) {

    const { projectPath, orgName, packageName, moduleName, version, isLocalRepository } = props;
    const { rpcClient } = useRpcContext();

    const [headerInfo, setHeaderInfo] = useState<HeaderInfo>(null);
    const [model, setServiceInitModel] = useState<ServiceInitModel>(null);
    const [formFields, setFormFields] = useState<FormField[]>([]);

    const [pullingStatus, setPullingStatus] = useState<PullingStatus>(PullingStatus.FETCHING);
    const [filePath, setFilePath] = useState<string>("");
    const [targetLineRange, setTargetLineRange] = useState<LineRange>();
    const [isSaving, setIsSaving] = useState<boolean>(false);
    const [serverValidationErrors, setServerValidationErrors] = useState<ValidationResult[]>([]);
    const [recordTypeFields, setRecordTypeFields] = useState<RecordTypeField[]>([]);
    const [selectionMode, setSelectionMode] = useState(false);
    const [pendingModel, setPendingModel] = useState<ServiceInitModel>(null);
    const [endpoints, setEndpoints] = useState<McpToolEndpoint[]>([]);
    const [selectedTools, setSelectedTools] = useState<Set<string>>(new Set());
    const [toolSearch, setToolSearch] = useState("");
    const [methodFilters, setMethodFilters] = useState<Set<string>>(new Set());
    const [loadingEndpoints, setLoadingEndpoints] = useState(false);
    const [endpointError, setEndpointError] = useState("");
    const [mcpImportConfiguration, setMcpImportConfiguration] = useState<McpImportConfiguration>(null);
    const [showAdvancedConfiguration, setShowAdvancedConfiguration] = useState(false);

    const isMountedRef = useRef(true);

    const MAIN_BALLERINA_FILE = "main.bal";

    const toMcpImportConfiguration = (defaults: McpServiceDefaults): McpImportConfiguration => ({
        serviceName: defaults.serviceName,
        version: defaults.version,
        basePath: defaults.basePath,
        port: String(defaults.port),
        listenerName: defaults.listenerName,
    });

    const applyMcpImportConfiguration = (serviceModel: ServiceInitModel, config: McpImportConfiguration) => {
        const properties = serviceModel.properties;
        if (properties.serviceName) properties.serviceName.value = config.serviceName;
        if (properties.version) properties.version.value = config.version;
        if (properties.basePath) properties.basePath.value = config.basePath;
        if (properties.listenTo) properties.listenTo.value = config.port;
        if (properties.listenerVarName) properties.listenerVarName.value = config.listenerName;
        return serviceModel;
    };

    // Lifted out of the effect (rather than a local closure) so the ERROR state's Retry button can
    // call it again — previously a failed fetch here left the loading screen stuck forever with no
    // way out: PullingStatus.ERROR was rendered but never actually set anywhere.
    const fetchData = async () => {
        setPullingStatus(PullingStatus.FETCHING);

        try {
            const promise = rpcClient
                .getServiceDesignerRpcClient()
                .getServiceInitModel({
                    filePath: "", orgName: orgName, pkgName: packageName, moduleName: moduleName,
                    listenerName: "", version: version, isLocalRepository: isLocalRepository
                });

            let timer: ReturnType<typeof setTimeout> | null = null;
            let didTimeout = false;
            let res;

            // Wait for up to 3 seconds for a fast response
            const timeoutPromise = new Promise<void>((resolve) => {
                timer = setTimeout(() => {
                    didTimeout = true;
                    if (isMountedRef.current) {
                        setPullingStatus(PullingStatus.PULLING);
                    }
                    resolve();
                }, 3000);
            });

            res = await Promise.race([
                promise.then((result) => {
                    if (timer) {
                        clearTimeout(timer);
                        timer = null;
                    }
                    return result;
                }),
                timeoutPromise.then(() => promise)
            ]);

            if (!isMountedRef.current) {
                return;
            }

            // If the response arrived before the timer, package is present, load form immediately
            if (!didTimeout && res?.serviceInitModel) {
                setHeaderInfo({
                    title: res.serviceInitModel.displayName,
                    moduleName: res.serviceInitModel.moduleName
                });
                setServiceInitModel(res.serviceInitModel);
                setFormFields(mapPropertiesToFormFields(res.serviceInitModel.properties));
                setPullingStatus(undefined);
            } else if (didTimeout && res?.serviceInitModel) {
                // If timer expired, show pulling status then load form
                setPullingStatus(PullingStatus.SUCCESS);
                setHeaderInfo({
                    title: res.serviceInitModel.displayName,
                    moduleName: res.serviceInitModel.moduleName
                });
                setServiceInitModel(res.serviceInitModel);
                setFormFields(mapPropertiesToFormFields(res.serviceInitModel.properties));
                setPullingStatus(undefined);
            } else {
                // The call resolved but came back with no model to show — treat it the same as a
                // failure rather than leaving the loading UI stuck with nothing to display.
                setPullingStatus(PullingStatus.ERROR);
                return;
            }

            rpcClient
                .getVisualizerRpcClient()
                .joinProjectPath({ segments: [MAIN_BALLERINA_FILE] })
                .then((response) => {
                    if (isMountedRef.current) {
                        setFilePath(response.filePath);
                    }
                });
        } catch (error) {
            console.error("Error fetching service init model:", error);
            if (isMountedRef.current) {
                setPullingStatus(PullingStatus.ERROR);
            }
        }
    };

    useEffect(() => {
        isMountedRef.current = true;
        fetchData();
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    useEffect(() => {
        if (filePath && rpcClient) {
            rpcClient
                .getBIDiagramRpcClient()
                .getEndOfFile({ filePath })
                .then((res) => {
                    if (!isMountedRef.current) {
                        return;
                    }
                    setTargetLineRange({
                        startLine: res,
                        endLine: res,
                    });
                });
        }
    }, [filePath, rpcClient]);

    useEffect(() => {
        if (model) {
            setRecordTypeFields(collectRecordTypeFields(model.properties));
        }
    }, [model]);

    const handleOnChange = (fieldKey: string, value: any) => {
        // Try to update the CHOICE field in the model (recursively)
        const wasUpdated = updateChoiceInModel(model.properties, fieldKey, value);

        if (wasUpdated) {
            // Regenerate form fields to reflect the nested structure changes
            const updatedFormFields = mapPropertiesToFormFields(model.properties);
            setFormFields(updatedFormFields);
        }
    };

    const handleOnSubmit = async (data: FormValues, formImports: FormImports) => {
        setIsSaving(true);
        const updatedModel = applyFormValuesToModel(formFields, model, data, formImports);

        await createService(updatedModel);
    };

    const createService = async (serviceModel: ServiceInitModel) => {
        setIsSaving(true);
        const res = await rpcClient
            .getServiceDesignerRpcClient()
            .createServiceAndListener({ filePath: "", serviceInitModel: serviceModel });

        if (!isMountedRef.current) {
            return;
        }

        // The language server refused the model: nothing was written, so keep the form open and
        // hand the failures to it rather than leaving the user on a stuck "Saving" button. Only an
        // ERROR blocks — a WARNING rides along with a successful save and must not trap the form.
        if (hasBlockingValidationErrors(res.validationErrors)) {
            setServerValidationErrors(res.validationErrors);
            setIsSaving(false);
            return;
        }
        setServerValidationErrors([]);

        const newArtifact = res.artifacts.find((artifact) => artifact.isNew && model.moduleName === artifact.moduleName)
            || res.artifacts.find((artifact) => artifact.isNew);
        if (newArtifact) {
            rpcClient.getVisualizerRpcClient().openView({ type: EVENT_TYPE.OPEN_VIEW, location: { documentUri: newArtifact.path, position: newArtifact.position } });
            setIsSaving(false);
            return;
        }
        // No artifact came back and nothing was rejected — release the button rather than hanging.
        setIsSaving(false);
    };

    const handleConfirmSelection = async () => {
        if (!pendingModel) return;
        const finalModel = mcpImportConfiguration
            ? applyMcpImportConfiguration(pendingModel, mcpImportConfiguration)
            : pendingModel;
        finalModel.selectedTools = Array.from(selectedTools);
        await createService(finalModel);
    };

    const handleBackFromSelection = () => {
        setSelectionMode(false);
        setEndpoints([]);
        setEndpointError("");
        setPendingModel(null);
        setToolSearch("");
        setMethodFilters(new Set());
        setMcpImportConfiguration(null);
        setShowAdvancedConfiguration(false);
    };

    const toggleTool = (toolName: string, checked: boolean) => {
        setSelectedTools((previous) => {
            const next = new Set(previous);
            checked ? next.add(toolName) : next.delete(toolName);
            return next;
        });
    };

    const allSelected = endpoints.length > 0 && selectedTools.size === endpoints.length;
    const toggleAll = (checked: boolean) => {
        setSelectedTools(checked ? new Set(endpoints.map((endpoint) => endpoint.toolName)) : new Set());
    };

    const toggleMethodFilter = (method: string) => {
        setMethodFilters((previous) => {
            const next = new Set(previous);
            next.has(method) ? next.delete(method) : next.add(method);
            return next;
        });
    };

    const updateMcpImportConfiguration = (key: keyof McpImportConfiguration, value: string) => {
        setMcpImportConfiguration((config) => config ? { ...config, [key]: value } : config);
    };

    const distinctMethods = Array.from(new Set(endpoints.map((endpoint) => endpoint.method.toUpperCase())));
    const query = toolSearch.trim().toLowerCase();
    const filteredEndpoints = endpoints.filter((endpoint) =>
        (methodFilters.size === 0 || methodFilters.has(endpoint.method.toUpperCase()))
        && (!query || endpoint.path.toLowerCase().includes(query)
            || endpoint.toolName.toLowerCase().includes(query)
            || endpoint.method.toLowerCase().includes(query)
            || endpoint.description?.toLowerCase().includes(query)));
    const selectedDesignApproach = model?.properties.designApproach?.choices?.find((choice) => choice.enabled);
    const isMcpOpenApiImport = moduleName === "mcp" && Boolean(selectedDesignApproach?.properties?.spec);
    const visibleFormFields = isMcpOpenApiImport
        ? formFields.filter((field) => field.key === "designApproach")
        : formFields;

    return (
        <View>
            {pullingStatus && (
                <StatusContainer>
                    {pullingStatus === PullingStatus.FETCHING && (
                        <RelativeLoader message="Loading package..." />
                    )}
                    {pullingStatus === PullingStatus.PULLING && (
                        <StatusCard>
                            {isLocalRepository ? (
                                <Icon name="bi-spinner" sx={{ color: ThemeColors.ON_SURFACE, fontSize: "18px" }} />
                            ) : (
                                <DownloadIcon color={ThemeColors.ON_SURFACE} />
                            )}
                            <StatusText variant="body2">
                                {isLocalRepository
                                    ? `Please wait while the ${packageName} package is being loaded from your `
                                    + "local repository..."
                                    : `Please wait while the ${packageName} package is being pulled...`}
                            </StatusText>
                        </StatusCard>
                    )}
                    {pullingStatus === PullingStatus.SUCCESS && (
                        <StatusCard>
                            <Icon name="bi-success" sx={{ color: ThemeColors.PRIMARY, fontSize: "18px" }} />
                            <StatusText variant="body2">
                                {isLocalRepository ? "Package loaded successfully." : "Package pulled successfully."}
                            </StatusText>
                        </StatusCard>
                    )}
                    {pullingStatus === PullingStatus.ERROR && (
                        <StatusCard>
                            <Icon name="bi-error" sx={{ color: ThemeColors.ERROR, fontSize: "18px" }} />
                            <StatusText variant="body2">
                                {isLocalRepository
                                    ? "Failed to load the package from your local repository. Please try again."
                                    : "Failed to pull the package. Please try again."}
                            </StatusText>
                            <Button appearance="secondary" onClick={fetchData}>Retry</Button>
                        </StatusCard>
                    )}
                </StatusContainer>
            )}

            {!pullingStatus && (
                <>
                    <TopNavigationBar projectPath={projectPath} />
                    {headerInfo && (
                        <TitleBar
                            title={headerInfo.title}
                            isBetaFeature={isBetaModule(headerInfo.moduleName)}
                            subtitle={model.description}
                        />
                    )}
                    <ViewContent>
                        <Container>
                            {selectionMode ? (
                                <SelectionContainer>
                                    <HeaderWrapper>
                                        <FormHeader
                                            title="Select Tools to Expose"
                                            subtitle="Each selected operation becomes an MCP tool that proxies requests to the underlying REST API."
                                        />
                                    </HeaderWrapper>
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
                                            {mcpImportConfiguration && (
                                                <>
                                                    <AdvancedConfigurationRow>
                                                        <span>Advanced Configurations</span>
                                                        <LinkButton
                                                            onClick={() => setShowAdvancedConfiguration((show) => !show)}
                                                            sx={{ fontSize: 13, padding: 8, color: ThemeColors.PRIMARY, gap: 4 }}
                                                        >
                                                            <Codicon name={showAdvancedConfiguration ? "chevron-up" : "chevron-down"} iconSx={{ fontSize: 12 }} sx={{ height: 12 }} />
                                                            {showAdvancedConfiguration ? "Collapse" : "Expand"}
                                                        </LinkButton>
                                                    </AdvancedConfigurationRow>
                                                    {showAdvancedConfiguration && (
                                                        <AdvancedFields>
                                                            <AdvancedField fullWidth><TextField label="Service Name" value={mcpImportConfiguration.serviceName} onTextChange={(value) => updateMcpImportConfiguration("serviceName", value)} /></AdvancedField>
                                                            <AdvancedField><TextField label="Version" value={mcpImportConfiguration.version} onTextChange={(value) => updateMcpImportConfiguration("version", value)} /></AdvancedField>
                                                            <AdvancedField><TextField label="Port" value={mcpImportConfiguration.port} onTextChange={(value) => updateMcpImportConfiguration("port", value)} /></AdvancedField>
                                                            <AdvancedField fullWidth><TextField label="Base Path" value={mcpImportConfiguration.basePath} onTextChange={(value) => updateMcpImportConfiguration("basePath", value)} /></AdvancedField>
                                                            <AdvancedField fullWidth><TextField label="Listener Name" value={mcpImportConfiguration.listenerName} onTextChange={(value) => updateMcpImportConfiguration("listenerName", value)} /></AdvancedField>
                                                        </AdvancedFields>
                                                    )}
                                                </>
                                            )}
                                            <SelectionActions>
                                                <Button appearance="secondary" onClick={handleBackFromSelection} disabled={isSaving}>Back</Button>
                                                <Button appearance="primary" onClick={handleConfirmSelection} disabled={isSaving || selectedTools.size === 0}>
                                                    {isSaving ? "Creating..." : `Create with ${selectedTools.size} tool${selectedTools.size === 1 ? "" : "s"}`}
                                                </Button>
                                            </SelectionActions>
                                        </SelectionBody>
                                    )}
                                </SelectionContainer>
                            ) : (
                                <>
                                    {visibleFormFields && visibleFormFields.length > 0 && (
                                        <FormContainer>
                                            <HeaderWrapper>
                                                <FormHeader title={`Create ${model.displayName}`} />
                                            </HeaderWrapper>
                                            {filePath && targetLineRange && (
                                                <NestedFormWrapper>
                                                    <ArtifactForm
                                                        fileName={filePath}
                                                        targetLineRange={targetLineRange}
                                                        fields={visibleFormFields}
                                                        isSaving={isSaving}
                                                        nestedForm={true}
                                                        onSubmit={handleOnSubmit}
                                                        onChange={handleOnChange}
                                                        serverValidationErrors={serverValidationErrors}
                                                        preserveFieldOrder={true}
                                                        recordTypeFields={recordTypeFields}
                                                        submitText="Create"
                                                    />
                                                </NestedFormWrapper>
                                            )}
                                        </FormContainer>
                                    )}
                                </>
                            )}
                        </Container>
                    </ViewContent>
                </>
            )}
        </View>
    );
}
