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

import { Button, Icon, ThemeColors, Typography, View, ViewContent } from "@wso2/ui-toolkit";
import { TopNavigationBar } from "../../../components/TopNavigationBar";
import { useEffect, useMemo, useRef, useState } from "react";
import { TitleBar } from "../../../components/TitleBar";
import { isBetaModule } from "../ComponentListView/componentListUtils";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { FormField, FormImports, FormValues } from "@wso2/ballerina-side-panel";
import { EVENT_TYPE, FunctionModel, hasBlockingValidationErrors, LineRange, RecordTypeField, ServiceInitModel, ValidationResult } from "@wso2/ballerina-core";
import { FormHeader } from "../../../components/FormHeader";
import ArtifactForm from "../Forms/ArtifactForm";
import { AgentEndpointFields, PromptContinuation } from "./Forms/AgentEndpointFields";
import styled from "@emotion/styled";
import { keyframes } from "@emotion/react";
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
    > div:last-child {
        > div:last-child {
            justify-content: flex-start;
        }
    }
`;

const FormContainer = styled.div`
    padding: 0 16px 100px;
    > div:first-of-type {
        padding: 0 4px;
    }
`;

const StatusContainer = styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
    flex: 1;
    min-height: 0;
    height: 100%;
`;

const formIn = keyframes`
    from { opacity: 0; transform: translateY(4px); }
    to { opacity: 1; transform: translateY(0); }
`;

const FormReveal = styled.div`
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    animation: ${formIn} 160ms ease-out both;
    > .side-panel-body {
        flex: 1 0 auto;
    }

    @media (prefers-reduced-motion: reduce) {
        animation: none;
    }
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

export interface ServiceCreationViewProps {
    projectPath: string;
    orgName: string;
    packageName: string;
    moduleName: string;
    version?: string;
    isLocalRepository?: boolean;
    agentName?: string;
    agentOrgName?: string;
    isPopup?: boolean;
    defaultValues?: Record<string, string>;
    collectEndpointShape?: boolean;
    onCreated?: () => void;
}

const INSTRUCTIONS_KEY = "instructions";

interface HeaderInfo {
    title: string;
    moduleName: string;
}

enum PullingStatus {
    FETCHING = "fetching",
    PULLING = "pulling",
    SUCCESS = "success",
    ERROR = "error",
}

export function ServiceCreationView(props: ServiceCreationViewProps) {

    const { projectPath, orgName, packageName, moduleName, version, isLocalRepository,
        agentName, agentOrgName, isPopup, onCreated, defaultValues , collectEndpointShape } = props;
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

    const isMountedRef = useRef(true);

    const MAIN_BALLERINA_FILE = "main.bal";

    const fetchData = async () => {
        setPullingStatus(PullingStatus.FETCHING);

        try {
            const promise = rpcClient
                .getServiceDesignerRpcClient()
                .getServiceInitModel({
                    filePath: "", orgName: orgName, pkgName: packageName, moduleName: moduleName,
                    listenerName: "", version: version, isLocalRepository: isLocalRepository,
                    agentName: agentName, agentOrgName: agentOrgName
                });

            let timer: ReturnType<typeof setTimeout> | null = null;
            let didTimeout = false;

            const timeoutPromise = new Promise<void>((resolve) => {
                timer = setTimeout(() => {
                    didTimeout = true;
                    if (isMountedRef.current) {
                        setPullingStatus(PullingStatus.PULLING);
                    }
                    resolve();
                }, 3000);
            });

            const res = await Promise.race([
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

            const initModel = res?.serviceInitModel;
            if (!initModel) {
                setPullingStatus(PullingStatus.ERROR);
                return;
            }

            Object.entries(defaultValues ?? {}).forEach(([key, value]) => {
                const field = initModel.properties?.[key];
                if (field) {
                    field.value = value;
                }
            });

            if (didTimeout) {
                setPullingStatus(PullingStatus.SUCCESS);
            }

            const target = await rpcClient
                .getVisualizerRpcClient()
                .joinProjectPath({ segments: [MAIN_BALLERINA_FILE] });
            const endOfFile = await rpcClient
                .getBIDiagramRpcClient()
                .getEndOfFile({ filePath: target.filePath });

            if (!isMountedRef.current) {
                return;
            }

            setHeaderInfo({ title: initModel.displayName, moduleName: initModel.moduleName });
            setServiceInitModel(initModel);
            setFormFields(mapPropertiesToFormFields(initModel.properties));
            setFilePath(target.filePath);
            setTargetLineRange({ startLine: endOfFile, endLine: endOfFile });
            setPullingStatus(undefined);
        } catch (error) {
            console.error("Error loading the service creation form:", error);
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
        if (model) {
            setRecordTypeFields(collectRecordTypeFields(model.properties));
        }
    }, [model]);

    const [endpointModel, setEndpointModel] = useState<FunctionModel>(undefined);
    const [endpointHasErrors, setEndpointHasErrors] = useState(false);

    useEffect(() => {
        if (!collectEndpointShape || endpointModel) {
            return;
        }
        rpcClient.getServiceDesignerRpcClient()
            .getHttpResourceModel({ type: "http", functionName: "resource" })
            .then((res) => {
                if (isMountedRef.current && res?.function) {
                    const shaped = res.function;
                    if (shaped.name && !shaped.name.value) {
                        shaped.name = { ...shaped.name, value: "." };
                    }
                    setEndpointModel(shaped);
                }
            });
    }, [collectEndpointShape, endpointModel]);

    const handleOnChange = (fieldKey: string, value: any) => {
        const wasUpdated = updateChoiceInModel(model.properties, fieldKey, value);

        if (wasUpdated) {
            const updatedFormFields = mapPropertiesToFormFields(model.properties);
            setFormFields(updatedFormFields);
        }
    };

    const handleOnSubmit = async (data: FormValues, formImports: FormImports) => {
        setIsSaving(true);
        const updatedModel = applyFormValuesToModel(formFields, model, data, formImports);
        if (collectEndpointShape && endpointModel) {
            updatedModel.resource = endpointModel;
        }

        const res = await rpcClient
            .getServiceDesignerRpcClient()
            .createServiceAndListener({ filePath: "", serviceInitModel: updatedModel });

        if (!isMountedRef.current) {
            return;
        }

        if (hasBlockingValidationErrors(res.validationErrors)) {
            setServerValidationErrors(res.validationErrors);
            setIsSaving(false);
            return;
        }
        setServerValidationErrors([]);

        if (onCreated) {
            onCreated();
            setIsSaving(false);
            return;
        }

        const newArtifact = res.artifacts.find(res => res.isNew && model.moduleName === res.moduleName);
        if (newArtifact) {
            rpcClient.getVisualizerRpcClient().openView({ type: EVENT_TYPE.OPEN_VIEW, location: { documentUri: newArtifact.path, position: newArtifact.position } });
            setIsSaving(false);
            return;
        }
        setIsSaving(false);
    }

    const statusView = pullingStatus && (
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
    );

    const endpointFormFields = useMemo(
        () => (formFields ?? []).map((field) => field.key === INSTRUCTIONS_KEY
            ? { ...field, growRange: { start: 2, offset: 12 } }
            : field),
        [formFields]
    );

    const endpointSlots = useMemo(
        () => collectEndpointShape && endpointModel
            ? [
                {
                    component: <AgentEndpointFields
                        model={endpointModel}
                        onChange={setEndpointModel}
                        onError={setEndpointHasErrors}
                    />,
                    index: 1
                },
                { component: <PromptContinuation model={endpointModel} />, index: Infinity }
            ]
            : undefined,
        [collectEndpointShape, endpointModel]
    );

    const form = !pullingStatus && formFields && formFields.length > 0 && filePath && targetLineRange && (
        <ArtifactForm
            fileName={filePath}
            targetLineRange={targetLineRange}
            fields={collectEndpointShape ? endpointFormFields : formFields}
            isSaving={isSaving}
            nestedForm={true}
            disableSaveButton={endpointHasErrors}
            injectedComponents={endpointSlots}
            onSubmit={handleOnSubmit}
            onChange={handleOnChange}
            serverValidationErrors={serverValidationErrors}
            preserveFieldOrder={true}
            recordTypeFields={recordTypeFields}
            submitText="Create"
        />
    );

    if (isPopup) {
        return (
            <>
                {statusView}
                {form && <FormReveal>{form}</FormReveal>}
            </>
        );
    }

    return (
        <View>
            {statusView}

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
                            {formFields && formFields.length > 0 && (
                                <FormContainer>
                                    <FormHeader title={`Create ${model.displayName}`} />
                                    {form}
                                </FormContainer>
                            )}
                        </Container>
                    </ViewContent>
                </>
            )}
        </View>
    );
}
