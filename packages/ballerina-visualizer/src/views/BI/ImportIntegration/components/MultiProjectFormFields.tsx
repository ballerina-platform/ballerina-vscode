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

import { useEffect } from "react";
import { DirectorySelector, TextField, CheckBox } from "@wso2/ui-toolkit";
import styled from "@emotion/styled";
import { useBiWsContext } from "../../wsManager/WsClientContext";

const FieldGroup = styled.div`
    margin-bottom: 20px;
`;

const CheckboxContainer = styled.div`
    margin: 16px 0;
`;

const Description = styled.div`
    color: var(--vscode-list-deemphasizedForeground);
    margin-top: 4px;
    text-align: left;
`;

export interface MultiProjectFormData {
    rootFolderName: string;
    path: string;
    createDirectory: boolean;
}

export interface MultiProjectFormFieldsProps {
    formData: MultiProjectFormData;
    onFormDataChange: (data: Partial<MultiProjectFormData>) => void;
    pathError?: string;
    folderNameError?: string;
}

export function MultiProjectFormFields({ formData, onFormDataChange, pathError, folderNameError }: MultiProjectFormFieldsProps) {
    const { wsClient } = useBiWsContext();

    const handleIntegrationName = (value: string) => {
        onFormDataChange({ rootFolderName: value });
    };

    const handleProjectDirSelection = async () => {
        const selectedDirectory = await wsClient.selectFileOrDirPath({});
        if (!selectedDirectory?.path) {
            return;
        }
        onFormDataChange({ path: selectedDirectory.path });
    };

    useEffect(() => {
        (async () => {
            if (!formData.path) {
                const currentDir = await wsClient.getWorkspaceRoot();
                onFormDataChange({ path: currentDir.path });
            }
        })();
    }, []);

    return (
        <>
            <FieldGroup>
                <DirectorySelector
                    id="multi-project-folder-selector"
                    label="Select Path"
                    placeholder="Enter path or browse to select a folder..."
                    selectedPath={formData.path}
                    onSelect={handleProjectDirSelection}
                    onChange={(value) => onFormDataChange({ path: value })}
                    errorMsg={pathError}
                />
            </FieldGroup>

            <FieldGroup>
                <CheckboxContainer>
                    <CheckBox
                        label="Create a new directory for integrations"
                        checked={formData.createDirectory}
                        onChange={(checked) => onFormDataChange({ createDirectory: checked })}
                    />
                </CheckboxContainer>
            </FieldGroup>

            {formData.createDirectory && (
                <FieldGroup>
                    <TextField
                        onTextChange={handleIntegrationName}
                        value={formData.rootFolderName}
                        label="Folder Name"
                        placeholder="Enter folder name"
                        autoFocus={true}
                        required={true}
                        errorMsg={folderNameError || ""}
                    />
                    <Description>
                        This direcotry will contain all migrated integrations.
                    </Description>
                </FieldGroup>
            )}
        </>
    );
}
