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

import { Button, Icon, ThemeColors, View, ViewContent } from "@wso2/ui-toolkit";
import { TopNavigationBar } from "../../../components/TopNavigationBar";
import { useEffect, useRef, useState } from "react";
import { TitleBar } from "../../../components/TitleBar";
import { isBetaModule } from "../ComponentListView/componentListUtils";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { FormField, FormImports, FormValues } from "@wso2/ballerina-side-panel";
import { DIRECTORY_MAP, EVENT_TYPE, hasBlockingValidationErrors, LineRange, ModelResolutionIssue, RecordTypeField, ServiceInitModel, ValidationResult } from "@wso2/ballerina-core";
import { FormHeader } from "../../../components/FormHeader";
import ArtifactForm from "../Forms/ArtifactForm";
import styled from "@emotion/styled";
import { DownloadIcon } from "../../../components/DownloadIcon";
import { RelativeLoader } from "../../../components/RelativeLoader";
import { McpOpenApiImportWizard } from "./McpOpenApiImportWizard";
import { HeaderWrapper, NestedFormWrapper, StatusCard, StatusText } from "./ServiceCreationLayout";
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

const FormContainer = styled.div`
    padding-bottom: 100px;
`;

const StatusContainer = styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100%;
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

interface McpImportRequest {
    model: ServiceInitModel;
    specPath: string;
}

enum PullingStatus {
    FETCHING = "fetching",
    PULLING = "pulling",
    SUCCESS = "success",
    ERROR = "error",
    UNSUPPORTED_VERSION = "unsupported_version",
    NO_SUPPORTED_VERSION = "no_supported_version",
    UPDATING = "updating",
}

enum ModelResolutionIssueCode {
    UNSUPPORTED_CONNECTOR_VERSION = "UNSUPPORTED_CONNECTOR_VERSION",
    NO_SUPPORTED_VERSION_AVAILABLE = "NO_SUPPORTED_VERSION_AVAILABLE",
}

/** The design approach choice's properties for whichever option is currently selected (e.g. manual vs. import-from-spec). */
function getEnabledDesignApproachProperties(model: ServiceInitModel) {
    return model?.properties.designApproach?.choices?.find((choice) => choice.enabled)?.properties;
}

interface PackagePullingStatusProps {
    status: PullingStatus;
    isLocalRepository?: boolean;
    packageName: string;
    upgradeIssue?: ModelResolutionIssue;
    onRetry: () => void;
    onUpdateNow: () => void;
}

function PackagePullingStatus({ status, isLocalRepository, packageName, upgradeIssue, onRetry, onUpdateNow }: PackagePullingStatusProps) {
    switch (status) {
        case PullingStatus.FETCHING:
            return <RelativeLoader message="Loading package..." />;
        case PullingStatus.PULLING:
        case PullingStatus.UPDATING:
            return (
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
            );
        case PullingStatus.SUCCESS:
            return (
                <StatusCard>
                    <Icon name="bi-success" sx={{ color: ThemeColors.PRIMARY, fontSize: "18px" }} />
                    <StatusText variant="body2">
                        {isLocalRepository ? "Package loaded successfully." : "Package pulled successfully."}
                    </StatusText>
                </StatusCard>
            );
        case PullingStatus.ERROR:
            return (
                <StatusCard>
                    <Icon name="bi-error" sx={{ color: ThemeColors.ERROR, fontSize: "18px" }} />
                    <StatusText variant="body2">
                        {isLocalRepository
                            ? "Failed to load the package from your local repository. Please try again."
                            : "Failed to pull the package. Please try again."}
                    </StatusText>
                    <Button appearance="secondary" onClick={onRetry}>Retry</Button>
                </StatusCard>
            );
        case PullingStatus.UNSUPPORTED_VERSION:
            return upgradeIssue ? (
                <StatusCard>
                    <Icon name="bi-error" sx={{ color: ThemeColors.ERROR, fontSize: "18px" }} />
                    <StatusText variant="body2">
                        A newer version of the {packageName} package is required to use this feature.
                    </StatusText>
                    <Button appearance="primary" onClick={onUpdateNow}>Update Now</Button>
                </StatusCard>
            ) : null;
        case PullingStatus.NO_SUPPORTED_VERSION:
            return (
                <StatusCard>
                    <Icon name="bi-error" sx={{ color: ThemeColors.ERROR, fontSize: "18px" }} />
                    <StatusText variant="body2">
                        {`No supported version of the ${packageName} package is available yet.`}
                    </StatusText>
                    <Button appearance="secondary" onClick={onRetry}>Retry</Button>
                </StatusCard>
            );
        default:
            return null;
    }
}

export function ServiceCreationView(props: ServiceCreationViewProps) {

    const { projectPath, orgName, packageName, moduleName, version, isLocalRepository } = props;
    const { rpcClient } = useRpcContext();

    const [headerInfo, setHeaderInfo] = useState<HeaderInfo>(null);
    const [model, setServiceInitModel] = useState<ServiceInitModel>(null);
    const [formFields, setFormFields] = useState<FormField[]>([]);

    const [pullingStatus, setPullingStatus] = useState<PullingStatus>(PullingStatus.FETCHING);
    const [upgradeIssue, setUpgradeIssue] = useState<ModelResolutionIssue | undefined>(undefined);
    const [filePath, setFilePath] = useState<string>("");
    const [targetLineRange, setTargetLineRange] = useState<LineRange>();
    const [isSaving, setIsSaving] = useState<boolean>(false);
    const [serverValidationErrors, setServerValidationErrors] = useState<ValidationResult[]>([]);
    const [recordTypeFields, setRecordTypeFields] = useState<RecordTypeField[]>([]);
    const [mcpImport, setMcpImport] = useState<McpImportRequest>(null);

    const isMountedRef = useRef(true);

    const MAIN_BALLERINA_FILE = "main.bal";

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
            } else if (res?.issue?.code === ModelResolutionIssueCode.UNSUPPORTED_CONNECTOR_VERSION) {
                setUpgradeIssue(res.issue);
                setPullingStatus(PullingStatus.UNSUPPORTED_VERSION);
                return;
            } else if (res?.issue?.code === ModelResolutionIssueCode.NO_SUPPORTED_VERSION_AVAILABLE) {
                setPullingStatus(PullingStatus.NO_SUPPORTED_VERSION);
                return;
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

    const handleUpdateNow = async () => {
        if (!upgradeIssue) {
            return;
        }
        setPullingStatus(PullingStatus.UPDATING);
        try {
            const result = await rpcClient.getServiceDesignerRpcClient().pullConnectorUpgrade({
                orgName: upgradeIssue.orgName,
                moduleName: upgradeIssue.moduleName,
                packageName: packageName,
                targetVersion: upgradeIssue.requiredVersion,
            });
            if (!isMountedRef.current) {
                return;
            }
            if (result.success) {
                setUpgradeIssue(undefined);
                fetchData();
            } else {
                setPullingStatus(PullingStatus.UNSUPPORTED_VERSION);
            }
        } catch (error) {
            console.error(">>> Error updating connector", error);
            if (isMountedRef.current) {
                setPullingStatus(PullingStatus.UNSUPPORTED_VERSION);
            }
        }
    };

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
        const updatedModel = applyFormValuesToModel(formFields, model, data, formImports);

        const specPath = getEnabledDesignApproachProperties(updatedModel)?.spec?.value as string | undefined;
        if (moduleName === "mcp" && specPath) {
            setMcpImport({ model: updatedModel, specPath });
            return;
        }

        setIsSaving(true);
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

        const strictMatch = res.artifacts.find((artifact) => artifact.isNew && model.moduleName === artifact.moduleName);
        // Only the MCP OpenAPI import falls back to a new SERVICE artifact; its edits may not carry the "mcp"
        // moduleName, and generation can also emit a new TYPE artifact (types.bal) in the same response.
        const newArtifact = strictMatch
            || (isMcpOpenApiImport
                ? res.artifacts.find((artifact) => artifact.isNew && artifact.type === DIRECTORY_MAP.SERVICE)
                : undefined);
        if (newArtifact) {
            rpcClient.getVisualizerRpcClient().openView({ type: EVENT_TYPE.OPEN_VIEW, location: { documentUri: newArtifact.path, position: newArtifact.position } });
            setIsSaving(false);
            return;
        }
        // No artifact came back and nothing was rejected — release the button rather than hanging.
        setIsSaving(false);
    };

    const enabledDesignApproachProperties = getEnabledDesignApproachProperties(model);
    // Existence, not value: this also drives field filtering below, so it must be true before a spec is picked.
    const isMcpOpenApiImport = moduleName === "mcp" && Boolean(enabledDesignApproachProperties?.spec);
    const visibleFormFields = isMcpOpenApiImport
        ? formFields.filter((field) => field.key === "designApproach")
        : formFields;

    return (
        <View>
            {pullingStatus && (
                <StatusContainer>
                    <PackagePullingStatus
                        status={pullingStatus}
                        isLocalRepository={isLocalRepository}
                        packageName={packageName}
                        upgradeIssue={upgradeIssue}
                        onRetry={fetchData}
                        onUpdateNow={handleUpdateNow}
                    />
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
                            {mcpImport ? (
                                <McpOpenApiImportWizard
                                    initialModel={mcpImport.model}
                                    specPath={mcpImport.specPath}
                                    filePath={filePath}
                                    targetLineRange={targetLineRange}
                                    recordTypeFields={recordTypeFields}
                                    isSaving={isSaving}
                                    serverValidationErrors={serverValidationErrors}
                                    onBack={() => setMcpImport(null)}
                                    onCreate={createService}
                                />
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
                                                        submitText={isMcpOpenApiImport ? "Next" : "Create"}
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
