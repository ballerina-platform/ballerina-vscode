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
import { useEffect, useRef, useState } from "react";
import { TitleBar } from "../../../components/TitleBar";
import { isBetaModule } from "../ComponentListView/componentListUtils";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { FormField, FormImports, FormValues } from "@wso2/ballerina-side-panel";
import { EVENT_TYPE, hasBlockingValidationErrors, LineRange, RecordTypeField, ServiceInitModel, ValidationResult } from "@wso2/ballerina-core";
import { FormHeader } from "../../../components/FormHeader";
import ArtifactForm from "../Forms/ArtifactForm";
import styled from "@emotion/styled";
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
    /* padding: 0 20px 20px; */
    max-width: 600px;
    height: 100%;
    > div:last-child {
        /* padding: 20px 0; */
        > div:last-child {
            justify-content: flex-start;
        }
    }
`;

const FormContainer = styled.div`
    /* padding-top: 15px; */
    padding-bottom: 100px;
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

        const res = await rpcClient
            .getServiceDesignerRpcClient()
            .createServiceAndListener({ filePath: "", serviceInitModel: updatedModel });

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

        const newArtifact = res.artifacts.find(res => res.isNew && model.moduleName === res.moduleName);
        if (newArtifact) {
            rpcClient.getVisualizerRpcClient().openView({ type: EVENT_TYPE.OPEN_VIEW, location: { documentUri: newArtifact.path, position: newArtifact.position } });
            setIsSaving(false);
            return;
        }
        // No artifact came back and nothing was rejected — release the button rather than hanging.
        setIsSaving(false);
    }

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
                            <>
                                {formFields && formFields.length > 0 && (
                                    <FormContainer>
                                        <FormHeader title={`Create ${model.displayName}`} />
                                        {filePath && targetLineRange && (
                                            <ArtifactForm
                                                fileName={filePath}
                                                targetLineRange={targetLineRange}
                                                fields={formFields}
                                                isSaving={isSaving}
                                                nestedForm={true}
                                                onSubmit={handleOnSubmit}
                                                onChange={handleOnChange}
                                                serverValidationErrors={serverValidationErrors}
                                                preserveFieldOrder={true}
                                                recordTypeFields={recordTypeFields}
                                                submitText="Create"
                                            />
                                        )}
                                    </FormContainer>
                                )}
                            </>
                        </Container>
                    </ViewContent>
                </>
            )}
        </View>
    );
}
