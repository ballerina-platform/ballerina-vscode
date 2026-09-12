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

import { GetRecordConfigResponse, GetRecordConfigRequest, LineRange, RecordTypeField, TypeField, PropertyTypeMemberInfo, UpdateRecordConfigRequest, RecordSourceGenRequest, RecordSourceGenResponse, GetRecordModelFromSourceRequest, GetRecordModelFromSourceResponse, getSecondaryInputType } from "@wso2/ballerina-core";
import { Dropdown, HelperPane, Typography } from "@wso2/ui-toolkit";
import styled from "@emotion/styled";
import { useEffect, useRef, useState} from "react";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { RecordConfigView } from "./RecordConfigView";
import { normalizeIntersections } from "../HelperPaneNew/Components/RecordConstructView/utils/intersection";

type ConfigureRecordPageProps = {
    fileName: string;
    targetLineRange?: LineRange;
    onChange: (value: string, isRecordConfigureChange: boolean) => void;
    currentValue: string;
    recordTypeField: RecordTypeField;
    onClose: () => void;
};

export const LabelContainer = styled.div({
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    paddingBottom: '20px'
});

export function ConfigureRecordPage(props: ConfigureRecordPageProps) {
    const { fileName, targetLineRange, onChange, currentValue, recordTypeField, onClose } = props;
    const { rpcClient } = useRpcContext();

    const [recordModel, setRecordModel] = useState<TypeField[]>([]);
    const [selectedMemberName, setSelectedMemberName] = useState<string>("");
    const firstRender = useRef<boolean>(true);
    const sourceCode = useRef<string>(currentValue);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    // Package coordinates of the currently selected record type, captured when building the
    // getRecordConfig request and reused for the generateValue (getRecordSource) call so the
    // backend can resolve imports.
    const codedataRef = useRef<RecordSourceGenRequest["codedata"]>(undefined);

    useEffect(() => {
        if (firstRender.current) {
            firstRender.current = false;
            if (currentValue) {
                getExistingRecordModel();
            } else {
                getNewRecordModel();
            }
        } else if (currentValue !== sourceCode.current) {
            // Close helper pane if user changed the value in the expression editor
            onClose();
        }
    }, [currentValue]);

    const fetchRecordModelFromSource = async (currentValue: string) => {
        setIsLoading(true);
        const getRecordModelFromSourceRequest: GetRecordModelFromSourceRequest = {
            filePath: fileName,
            typeMembers: recordTypeField.recordTypeMembers,
            expr: currentValue
        }

        const getRecordModelFromSourceResponse: GetRecordModelFromSourceResponse =
            await rpcClient.getBIDiagramRpcClient().getRecordModelFromSource(getRecordModelFromSourceRequest);
        console.log(">>> getRecordModelFromSourceResponse", getRecordModelFromSourceResponse);
        const newRecordModel = getRecordModelFromSourceResponse.recordConfig;

        if (newRecordModel) {
            const recordConfig: TypeField = {
                name: newRecordModel.name,
                ...normalizeIntersections(newRecordModel)
            }

            setRecordModel([recordConfig]);
            setSelectedMemberName(newRecordModel.name);
        }

        setIsLoading(false);
    }

    const getExistingRecordModel = async () => {
        await fetchRecordModelFromSource(currentValue);
    };

    const getNewRecordModel = async () => {
        setIsLoading(true);
        const defaultSelection = recordTypeField.recordTypeMembers[0];
        setSelectedMemberName(defaultSelection.type);

        let org = "";
        let module = "";
        let version = "";
        let packageName = "";
        if (defaultSelection?.packageInfo.length > 0) {
            const parts = defaultSelection.packageInfo.split(':');
            if (parts.length === 3) {
                [org, module, version] = parts;
                packageName = defaultSelection.packageName;
            }
        } else {
            // Fetch from TOML
            const tomValues = await rpcClient.getCommonRpcClient().getCurrentProjectTomlValues();
            org = tomValues?.package?.org || "";
            module = tomValues?.package?.name || "";
            version = tomValues?.package?.version || "";
            packageName = `${org}/${module}`;
        }

        const request: GetRecordConfigRequest = {
            filePath: fileName,
            codedata: {
                org: org,
                module: module,
                version: version,
                packageName: defaultSelection?.packageName,
            },
            typeConstraint: defaultSelection.type,
        }
        codedataRef.current = request.codedata;
        const typeFieldResponse: GetRecordConfigResponse = await rpcClient.getBIDiagramRpcClient().getRecordConfig(request);
        console.log(">>> GetRecordConfigResponse", typeFieldResponse);
        if (typeFieldResponse.recordConfig) {
            const recordConfig: TypeField = {
                name: defaultSelection.type,
                ...normalizeIntersections(typeFieldResponse.recordConfig)
            }

            setRecordModel([recordConfig]);
        }
        setIsLoading(false);
    }

    const handleMemberChange = async (value: string) => {
        const member = recordTypeField.recordTypeMembers.find(m => m.type === value);
        if (member) {
            setIsLoading(true);
            setSelectedMemberName(member.type);

            let org = "";
            let module = "";
            let version = "";
            let packageName = "";

            if (member?.packageInfo.length > 0) {
                const parts = member.packageInfo.split(':');
                if (parts.length === 3) {
                    [org, module, version] = parts;
                    packageName = member.packageName;
                }
            } else {
                // Fetch from TOML
                const tomValues = await rpcClient.getCommonRpcClient().getCurrentProjectTomlValues();
                org = tomValues?.package?.org || "";
                module = tomValues?.package?.name || "";
                version = tomValues?.package?.version || "";
                packageName = `${org}/${module}`;
            }

            const request: GetRecordConfigRequest = {
                filePath: fileName,
                codedata: {
                    org: org,
                    module: module,
                    version: version,
                    packageName: member?.packageName,
                },
                typeConstraint: member.type,
            }
            codedataRef.current = request.codedata;

            const typeFieldResponse: GetRecordConfigResponse = await rpcClient.getBIDiagramRpcClient().getRecordConfig(request);
            if (typeFieldResponse.recordConfig) {
                const recordConfig: TypeField = {
                    name: member.type,
                    ...normalizeIntersections(typeFieldResponse.recordConfig)
                }

                setRecordModel([recordConfig]);
            }
        }

        setIsLoading(false);
    };

    const handleModelChange = async (updatedModel: TypeField[]) => {
        // The expression editor type (e.g. the union "jco:DestinationConfig|jco:AdvancedConfig")
        // is the type the generated value is assigned to. Sent as the optional typeConstraint.
        const typeConstraint = getSecondaryInputType(recordTypeField?.property?.types)?.ballerinaType;
        const request: RecordSourceGenRequest = {
            filePath: fileName,
            type: updatedModel[0],
            ...(typeConstraint ? { typeConstraint } : {}),
            ...(codedataRef.current ? { codedata: codedataRef.current } : {})
        }
        const recordSourceResponse: RecordSourceGenResponse = await rpcClient.getBIDiagramRpcClient().getRecordSource(request);
        console.log(">>> recordSourceResponse", recordSourceResponse);

        if (recordSourceResponse.recordValue !== undefined) {
            const content = recordSourceResponse.recordValue;
            sourceCode.current = content;
            onChange(content, true);
        }
    }

    return (
        <>
            <HelperPane.Body>
                {isLoading ? (
                    <HelperPane.Loader />
                ) : (
                    <>
                        {recordTypeField?.recordTypeMembers.length > 1 && (
                            <LabelContainer>
                                <Dropdown
                                    id="type-selector"
                                    label="Type"
                                    value={selectedMemberName}
                                    items={recordTypeField.recordTypeMembers.map((member) => ({
                                        label: member.type,
                                        value: member.type
                                    }))}
                                    onValueChange={(value) => handleMemberChange(value)}
                                />

                            </LabelContainer>
                        )}
                        {selectedMemberName && recordModel?.length > 0 ?
                            (
                                <RecordConfigView
                                    recordModel={recordModel}
                                    onModelChange={handleModelChange}
                                />
                            ) : (
                                <Typography variant="body3">Record construction assistance is unavailable. Please check the Suggestions tab.</Typography>
                            )}
                    </>
                )}
            </HelperPane.Body>
        </>
    );
}
