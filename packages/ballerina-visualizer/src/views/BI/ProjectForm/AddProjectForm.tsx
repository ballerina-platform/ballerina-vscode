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

import { useCallback, useEffect, useState } from "react";
import { Button, Icon, Typography } from "@wso2/ui-toolkit";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import {
    PageWrapper,
    FormContainer,
    TitleContainer,
    ScrollableContent,
    ButtonWrapper,
    IconButton,
} from "./styles";
import { AddProjectFormFields } from "./AddProjectFormFields";
import { AddProjectFormData } from "./types";
import { isFormValidAddProject, sanitizeOrgHandle } from "./utils";
import { ValidateProjectFormErrorField } from "@wso2/ballerina-core";
export function AddProjectForm() {
    const { rpcClient } = useRpcContext();
    const [formData, setFormData] = useState<AddProjectFormData>({
        integrationName: "",
        packageName: "",
        workspaceName: "",
        orgName: "",
        version: "",
        isLibrary: false,
    });
    const [isInProject, setIsInProject] = useState<boolean>(false);
    const [targetPath, setTargetPath] = useState<string>("");
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [pathValidationError, setPathValidationError] = useState<string | null>(null);
    const [packageNameValidationError, setPackageNameValidationError] = useState<string | null>(null);
    const [projectNameValidationError, setProjectNameValidationError] = useState<string | null>(null);
    const [projectHandlePathError, setProjectHandlePathError] = useState<string | null>(null);
    const resourceTypeLabel = formData.isLibrary ? "Library" : "Integration";

    const handleFormDataChange = useCallback((data: Partial<AddProjectFormData>) => {
        setFormData(prev => ({ ...prev, ...data }));
        setPathValidationError(null);
        setPackageNameValidationError(null);
        setProjectNameValidationError(null);
        setProjectHandlePathError(null);
    }, []);

    useEffect(() => {
        Promise.all([
            rpcClient.getCommonRpcClient().getWorkspaceRoot(),
            rpcClient.getCommonRpcClient().getWorkspaceType()
        ]).then(async ([workspaceRoot, workspaceType]) => {
            const inProject = workspaceType.type === "BALLERINA_WORKSPACE";
            setTargetPath(workspaceRoot.path);
            setIsInProject(inProject);

            try {
                const defaults = await rpcClient.getBIDiagramRpcClient().getSuggestedProjectDefaults({ isInProject: inProject });
                setFormData(prev => ({
                    ...prev,
                    workspaceName: inProject ? prev.workspaceName : defaults.projectName,
                    projectHandle: inProject ? prev.projectHandle : defaults.projectHandle,
                    integrationName: defaults.integrationName,
                    packageName: defaults.packageName,
                }));
            } catch {
                // defaults unavailable — leave form empty
            }
        });
    }, []);

    const handleAddProject = async () => {
        setIsLoading(true);
        setPathValidationError(null);
        setPackageNameValidationError(null);
        setProjectNameValidationError(null);
        setProjectHandlePathError(null);

        try {
            // Validate the project path
            // When converting to a project and a projectHandle is set (logged-in user), use it as the directory name
            const workspaceNameForPath = (!isInProject && formData.projectHandle) ? formData.projectHandle : formData.workspaceName;
            const targetNameForValidation = !isInProject
                ? workspaceNameForPath
                : formData.packageName;

            const validationResult = await rpcClient.getBIDiagramRpcClient().validateProjectPath({
                projectPath: targetPath,
                projectName: targetNameForValidation,
                createDirectory: true,
                createAsWorkspace: !isInProject,
            });

            if (!validationResult.isValid) {
                // Show error on the appropriate field
                if (validationResult.errorField === ValidateProjectFormErrorField.PATH) {
                    setPathValidationError(validationResult.errorMessage || `Invalid ${resourceTypeLabel.toLowerCase()} path`);
                } else if (validationResult.errorField === ValidateProjectFormErrorField.NAME) {
                    if (isInProject) {
                        setPackageNameValidationError(
                            validationResult.errorMessage || `Invalid ${resourceTypeLabel.toLowerCase()} name`
                        );
                    } else if (formData.projectHandle) {
                        // Path was validated against projectHandle — surface the error on Project ID field
                        setProjectHandlePathError(validationResult.errorMessage || "A directory with this Project ID already exists");
                    } else {
                        setProjectNameValidationError(
                            validationResult.errorMessage || "Invalid project name"
                        );
                    }
                }
                setIsLoading(false);
                return;
            }

            const orgHandle = sanitizeOrgHandle(formData.orgName);

            // If validation passes, add the project
            void rpcClient.getBIDiagramRpcClient().addProjectToWorkspace({
                projectName: formData.integrationName,
                packageName: formData.packageName,
                convertToWorkspace: !isInProject,
                path: targetPath,
                workspaceName: formData.workspaceName,
                orgName: formData.orgName || undefined,
                orgHandle,
                version: formData.version || undefined,
                isLibrary: formData.isLibrary,
                projectHandle: formData.projectHandle,
            }).catch(() => undefined);
        } catch (error) {
            setPathValidationError(error instanceof Error ? error.message : "An error occurred during validation");
            setIsLoading(false);
        }
    };

    const goBack = () => {
        rpcClient.getVisualizerRpcClient().goBack();
    };

    return (
        <PageWrapper>
            <FormContainer>
                <TitleContainer>
                    <IconButton onClick={goBack}>
                        <Icon name="bi-arrow-back" iconSx={{ color: "var(--vscode-foreground)" }} />
                    </IconButton>
                    <Typography variant="h2">
                        {!isInProject
                            ? `Convert to Project & Add New ${resourceTypeLabel}`
                            : `Add New ${resourceTypeLabel}`}
                    </Typography>
                </TitleContainer>

                <ScrollableContent>
                    <AddProjectFormFields
                        formData={formData}
                        onFormDataChange={handleFormDataChange}
                        isInProject={isInProject}
                        packageNameValidationError={packageNameValidationError || undefined}
                        projectNameValidationError={projectNameValidationError || undefined}
                        projectHandlePathError={projectHandlePathError || undefined}
                    />
                </ScrollableContent>

                <ButtonWrapper>
                    {pathValidationError && (
                        <Typography 
                            variant="body2" 
                            sx={{ 
                                color: "var(--vscode-errorForeground)", 
                                marginRight: "16px",
                                flex: 1
                            }}
                        >
                            {pathValidationError}
                        </Typography>
                    )}
                    <Button
                        disabled={!isFormValidAddProject(formData, isInProject) || isLoading}
                        onClick={handleAddProject}
                        appearance="primary"
                    >
                        {isLoading ? (
                            <Typography variant="progress">
                                {!isInProject
                                    ? "Converting & Adding..."
                                    : "Adding..."}
                            </Typography>
                        ) : (
                            !isInProject
                                ? `Convert & Add ${resourceTypeLabel}`
                                : `Add ${resourceTypeLabel}`
                        )}
                    </Button>
                </ButtonWrapper>
            </FormContainer>
        </PageWrapper>
    );
}
