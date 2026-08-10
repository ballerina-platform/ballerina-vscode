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
import { Icon, ThemeColors, Typography } from "@wso2/ui-toolkit";
import { LineRange, RecordTypeField, ServiceInitModel } from "@wso2/ballerina-core";
import { FormField, FormImports, FormValues } from "@wso2/ballerina-side-panel";
import { FormHeader } from "../../../../../components/FormHeader";
import { DownloadIcon } from "../../../../../components/DownloadIcon";
import { RelativeLoader } from "../../../../../components/RelativeLoader";
import ArtifactForm from "../../../Forms/ArtifactForm";
import {
    applyFormValuesToModel,
    collectRecordTypeFields,
    mapPropertiesToFormFields,
    updateChoiceInModel,
} from "../../../ServiceDesigner/serviceInitModelUtils";
import { BiWsClient } from "../../../wsManager/WsClient";
import { PullingStatus, useServiceInitModel } from "../../hooks/useServiceInitModel";
import { ArtifactCard } from "../../artifactCatalog";

const StatusContainer = styled.div`
    flex: 1;
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 48px 0;
`;

const StatusCard = styled.div`
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

/** Fills the step's full height so the nested ArtifactForm's `footerActionButton`
 *  can pin the submit button to the bottom instead of trailing the fields. */
const FormContainer = styled.div`
    /* Fill the wizard's content column so the Configure step matches the width of
       the previous steps (Type picker / chooser) rather than a narrower 600px. */
    width: 100%;
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
`;

const FormBody = styled.div`
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
`;

/** Collect-only target range: the scaffolded main.bal is empty, and the range is
 *  only used as context for (stubbed) completion/diagnostic requests. */
const START_OF_FILE: LineRange = {
    startLine: { line: 0, offset: 0 },
    endLine: { line: 0, offset: 0 },
};

interface ServiceConfigureFormProps {
    wsClient: BiWsClient;
    /** The silently scaffolded package root. */
    projectRoot: string;
    selection: ArtifactCard;
    isSubmitting: boolean;
    /** Model cached by the wizard root from an earlier visit (back-navigation). */
    cachedModel?: ServiceInitModel | null;
    /** Reports the fetched model so the wizard root can cache it across steps. */
    onModelLoaded?: (model: ServiceInitModel) => void;
    /** Hands the populated model up to the wizard root — no RPC submission here. */
    onSubmit: (model: ServiceInitModel) => void;
}

/**
 * The Configure step for service-kind artifacts (HTTP/GraphQL/TCP/event/file/MCP): renders
 * the LS-served service-init model with the shared ArtifactForm in collect-only
 * mode, mirroring ServiceCreationView's CHOICE handling and pulling states.
 */
export function ServiceConfigureForm({ wsClient, projectRoot, selection, isSubmitting, cachedModel, onModelLoaded, onSubmit }: ServiceConfigureFormProps) {
    const { org, packageName, moduleName } = selection.artifactInfo;
    const { model, pullingStatus } = useServiceInitModel({
        wsClient,
        projectRoot,
        orgName: org,
        packageName,
        moduleName,
        cachedModel,
    });

    const [formFields, setFormFields] = useState<FormField[]>([]);
    const [recordTypeFields, setRecordTypeFields] = useState<RecordTypeField[]>([]);
    const [targetFilePath, setTargetFilePath] = useState<string>("");

    useEffect(() => {
        if (model) {
            setFormFields(mapPropertiesToFormFields(model.properties));
            setRecordTypeFields(collectRecordTypeFields(model.properties));
            onModelLoaded?.(model);
        }
    }, [model]);

    useEffect(() => {
        // Ensures main.bal exists in the scaffold (didOpen'd to the LS) and
        // resolves the file the form's field requests are anchored to.
        wsClient
            .getWizardFormTarget({ projectRoot })
            .then((res) => setTargetFilePath(res.filePath))
            .catch((error) => console.error(">>> Error resolving wizard form target", error));
    }, [wsClient, projectRoot]);

    const handleOnChange = (fieldKey: string, value: any) => {
        if (!model) {
            return;
        }
        const wasUpdated = updateChoiceInModel(model.properties, fieldKey, value);
        if (wasUpdated) {
            setFormFields(mapPropertiesToFormFields(model.properties));
        }
    };

    const handleOnSubmit = (data: FormValues, formImports?: FormImports) => {
        const populatedModel = applyFormValuesToModel(formFields, model, data, formImports);
        onSubmit(populatedModel);
    };

    return (
        <>
            {pullingStatus && (
                <StatusContainer>
                    {pullingStatus === PullingStatus.FETCHING && <RelativeLoader message="Loading package..." />}
                    {pullingStatus === PullingStatus.PULLING && (
                        <StatusCard>
                            <DownloadIcon color={ThemeColors.ON_SURFACE} />
                            <Typography variant="body2">
                                Please wait while the {packageName} package is being pulled...
                            </Typography>
                        </StatusCard>
                    )}
                    {pullingStatus === PullingStatus.ERROR && (
                        <StatusCard>
                            <Icon name="bi-error" sx={{ color: ThemeColors.ERROR, fontSize: "18px" }} />
                            <Typography variant="body2">
                                Failed to load the {packageName} package. Please go back and try again.
                            </Typography>
                        </StatusCard>
                    )}
                </StatusContainer>
            )}
            {!pullingStatus && model && formFields.length > 0 && (
                <FormContainer>
                    <FormHeader title={`Create ${model.displayName}`} />
                    {targetFilePath && (
                        <FormBody>
                            <ArtifactForm
                                fileName={targetFilePath}
                                targetLineRange={START_OF_FILE}
                                fields={formFields}
                                isSaving={isSubmitting}
                                footerActionButton={true}
                                onSubmit={handleOnSubmit}
                                onChange={handleOnChange}
                                preserveFieldOrder={true}
                                recordTypeFields={recordTypeFields}
                                submitText="Create Integration"
                            />
                        </FormBody>
                    )}
                </FormContainer>
            )}
        </>
    );
}
