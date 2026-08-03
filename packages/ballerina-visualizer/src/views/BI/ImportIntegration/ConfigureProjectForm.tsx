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

import { ActionButtons, Typography } from "@wso2/ui-toolkit";
import { useState } from "react";
import { useBiWsContext } from "../wsManager/WsClientContext";
import { ValidateProjectFormErrorField } from "@wso2/ballerina-core";
import { BodyText } from "../../styles";
import { ProjectFormData, ProjectFormFields } from "../ProjectForm/ProjectFormFields";
import { validatePackageName } from "../ProjectForm/utils";
import { MultiProjectFormData, MultiProjectFormFields } from "./components/MultiProjectFormFields";
import { ButtonWrapper } from "./styles";
import { ConfigureProjectFormProps } from "./types";

export function ConfigureProjectForm({ isMultiProject, onNext, onBack }: ConfigureProjectFormProps) {
    const { wsClient } = useBiWsContext();
    const [singleIntegrationData, setSingleIntegrationData] = useState<ProjectFormData>({
        integrationName: "",
        packageName: "",
        path: "",
        createDirectory: true,
        createAsWorkspace: false,
        workspaceName: "",
        orgName: "",
        version: "",
        isLibrary: false,
    });

    const [multiProjectData, setMultiProjectData] = useState<MultiProjectFormData>({
        rootFolderName: "",
        path: "",
        createDirectory: true,
    });

    const [isValidating, setIsValidating] = useState(false);
    const [pathError, setPathError] = useState<string | null>(null);
    const [folderNameError, setFolderNameError] = useState<string | null>(null);
    const [singleIntegrationNameError, setSingleIntegrationNameError] = useState<string | null>(null);
    const [singleIntegrationPathError, setSingleIntegrationPathError] = useState<string | null>(null);
    const [projectNameError, setProjectNameError] = useState<string | null>(null);
    const [singleIntegrationPackageNameError, setSingleIntegrationPackageNameError] = useState<string | null>(null);
    const selectedResourceTypeLabel = singleIntegrationData.isLibrary ? "Library" : "Integration";

    const handleSingleProjectFormChange = (data: Partial<ProjectFormData>) => {
        setSingleIntegrationData(prev => ({ ...prev, ...data }));
        // Clear validation errors when form data changes
        if (singleIntegrationNameError) {
            setSingleIntegrationNameError(null);
        }
        if (singleIntegrationPathError) {
            setSingleIntegrationPathError(null);
        }
        if (projectNameError) {
            setProjectNameError(null);
        }
        if (singleIntegrationPackageNameError) {
            setSingleIntegrationPackageNameError(null);
        }
    };

    const handleMultiProjectFormChange = (data: Partial<MultiProjectFormData>) => {
        setMultiProjectData(prev => ({ ...prev, ...data }));
        // Clear validation errors when form data changes
        if (pathError) {
            setPathError(null);
        }
        if (folderNameError) {
            setFolderNameError(null);
        }
    };

    const handleCreateSingleProject = async () => {
        setIsValidating(true);
        setSingleIntegrationNameError(null);
        setSingleIntegrationPathError(null);
        setProjectNameError(null);
        setSingleIntegrationPackageNameError(null);

        // Validate required fields first
        let hasError = false;

        if (singleIntegrationData.integrationName.trim().length < 2) {
            setSingleIntegrationNameError(`${selectedResourceTypeLabel} name must be at least 2 characters`);
            hasError = true;
        }

        if (singleIntegrationData.packageName.trim().length < 2) {
            setSingleIntegrationPackageNameError("Package name must be at least 2 characters");
            hasError = true;
        } else {
            const packageNameError = validatePackageName(singleIntegrationData.packageName, singleIntegrationData.integrationName);
            if (packageNameError) {
                setSingleIntegrationPackageNameError(packageNameError);
                hasError = true;
            }
        }

        if (singleIntegrationData.path.trim().length < 2) {
            setSingleIntegrationPathError(`Please select a path for your ${selectedResourceTypeLabel.toLowerCase()}`);
            hasError = true;
        }

        if (hasError) {
            setIsValidating(false);
            return;
        }

        try {
            // Validate the project path
            const targetNameForValidation = singleIntegrationData.createAsWorkspace
                ? singleIntegrationData.workspaceName
                : singleIntegrationData.packageName;
            const validationResult = await wsClient.validateProjectPath({
                projectPath: singleIntegrationData.path,
                projectName: targetNameForValidation,
                createDirectory: singleIntegrationData.createDirectory,
            });

            if (!validationResult.isValid) {
                // Show error on the appropriate field
                if (validationResult.errorField === ValidateProjectFormErrorField.PATH) {
                    if (singleIntegrationData.createAsWorkspace) {
                        setSingleIntegrationPathError(validationResult.errorMessage || "Invalid project path");
                    } else {
                        setSingleIntegrationPathError(
                            validationResult.errorMessage || `Invalid ${selectedResourceTypeLabel.toLowerCase()} path`
                        );
                    }
                } else if (validationResult.errorField === ValidateProjectFormErrorField.NAME) {
                    if (singleIntegrationData.createAsWorkspace) {
                        setProjectNameError(
                            validationResult.errorMessage || "Invalid project name"
                        );
                    } else {
                        setSingleIntegrationPackageNameError(
                            validationResult.errorMessage || `Invalid ${selectedResourceTypeLabel.toLowerCase()} name`
                        );
                    }
                }
                setIsValidating(false);
                return;
            }

            // If validation passes, proceed
            const payload = {
                projectName: singleIntegrationData.integrationName,
                packageName: singleIntegrationData.packageName,
                projectPath: singleIntegrationData.path,
                createDirectory: singleIntegrationData.createDirectory,
                createAsWorkspace: singleIntegrationData.createAsWorkspace,
                workspaceName: singleIntegrationData.workspaceName,
                orgName: singleIntegrationData.orgName || undefined,
                version: singleIntegrationData.version || undefined,
                isLibrary: singleIntegrationData.isLibrary,
            };
            await onNext(payload, false);
        } catch (error) {
            setSingleIntegrationPathError("An error occurred during validation");
        } finally {
            setIsValidating(false);
        }
    };

    const handleCreateMultiProject = async () => {
        setIsValidating(true);
        setPathError(null);
        setFolderNameError(null);

        // Validate required fields first
        let hasError = false;

        if (!multiProjectData.path.trim() || multiProjectData.path.length < 2) {
            setPathError("Please select a path for your project");
            hasError = true;
        }

        if (multiProjectData.createDirectory && (!multiProjectData.rootFolderName.trim() || multiProjectData.rootFolderName.length < 1)) {
            setFolderNameError("Folder name is required when creating a new directory");
            hasError = true;
        }

        if (hasError) {
            setIsValidating(false);
            return;
        }

        try {
            // Validate the project path
            const validationResult = await wsClient.validateProjectPath({
                projectPath: multiProjectData.path,
                projectName: multiProjectData.rootFolderName,
                createDirectory: multiProjectData.createDirectory,
            });

            if (!validationResult.isValid) {
                // Show error on the appropriate field
                if (validationResult.errorField === ValidateProjectFormErrorField.PATH) {
                    setPathError(validationResult.errorMessage || "Invalid project path");
                } else if (validationResult.errorField === ValidateProjectFormErrorField.NAME) {
                    setFolderNameError(validationResult.errorMessage || "Invalid folder name");
                }
                setIsValidating(false);
                return;
            }

            // If validation passes, proceed
            await onNext({
                projectName: multiProjectData.rootFolderName,
                packageName: multiProjectData.rootFolderName,
                projectPath: multiProjectData.path,
                createDirectory: multiProjectData.createDirectory,
                createAsWorkspace: false,
            }, false);
        } catch (error) {
            setPathError("An error occurred during validation");
        } finally {
            setIsValidating(false);
        }
    };

    return (
        <>
            {isMultiProject ? (
                <>
                    <Typography variant="h2">Configure Multi-Project Import</Typography>
                    <BodyText>Select the location where you want to save the migrated integrations.</BodyText>

                    <MultiProjectFormFields
                        formData={multiProjectData}
                        onFormDataChange={handleMultiProjectFormChange}
                        pathError={pathError || undefined}
                        folderNameError={folderNameError || undefined}
                    />

                    <ButtonWrapper>
                        <ActionButtons
                            primaryButton={{
                                text: isValidating ? "Validating..." : "Start Migration",
                                onClick: handleCreateMultiProject,
                                disabled: isValidating
                            }}
                            secondaryButton={{
                                text: "Back",
                                onClick: onBack,
                                disabled: false
                            }}
                        />
                    </ButtonWrapper>
                </>
            ) : (
                <>
                    <Typography variant="h2">Configure Your {selectedResourceTypeLabel}</Typography>
                    <BodyText>
                        Please provide the necessary details to create your {selectedResourceTypeLabel.toLowerCase()}.
                    </BodyText>

                    <ProjectFormFields
                        formData={singleIntegrationData}
                        onFormDataChange={handleSingleProjectFormChange}
                        integrationNameError={singleIntegrationNameError || undefined}
                        pathError={singleIntegrationPathError || undefined}
                        projectNameError={projectNameError || undefined}
                        packageNameValidationError={singleIntegrationPackageNameError || undefined}
                    />

                    <ButtonWrapper>
                        <ActionButtons
                            primaryButton={{
                                text: isValidating ? "Validating..." : "Start Migration",
                                onClick: handleCreateSingleProject,
                                disabled: isValidating
                            }}
                            secondaryButton={{
                                text: "Back",
                                onClick: onBack,
                                disabled: false
                            }}
                        />
                    </ButtonWrapper>
                </>
            )}
        </>
    );
}
