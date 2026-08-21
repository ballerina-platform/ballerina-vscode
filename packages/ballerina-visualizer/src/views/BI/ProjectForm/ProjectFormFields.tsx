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

import { useEffect, useRef, useState } from "react";
import { TextField, CheckBox, DirectorySelector } from "@wso2/ui-toolkit";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { usePlatformExtContext } from "../../../providers/platform-ext-ctx-provider";
import {
    FieldGroup,
    CheckboxContainer,
    Description,
    SectionDivider,
    OptionalSectionsLabel,
} from "./styles";
import { CollapsibleSection, ProjectTypeSelector, AdvancedConfigurationSection } from "./components";
import { projectTypeOptions } from "./productTerms";
import { useProductTerms } from "./useProductTerms";
import { ProjectFormData } from "./types";
import { sanitizePackageName, validatePackageName, validateOrgName } from "./utils";

// Re-export for backwards compatibility
export type { ProjectFormData } from "./types";

export interface ProjectFormFieldsProps {
    formData: ProjectFormData;
    onFormDataChange: (data: Partial<ProjectFormData>) => void;
    integrationNameError?: string;
    pathError?: string;
    projectNameError?: string;
    packageNameValidationError?: string;
}

export function ProjectFormFields({
    formData,
    onFormDataChange,
    integrationNameError,
    pathError,
    projectNameError,
    packageNameValidationError,
}: ProjectFormFieldsProps) {
    const terms = useProductTerms();
    const { rpcClient } = useRpcContext();
    const { platformExtState } = usePlatformExtContext();
    const isLoggedIn = !!platformExtState?.isLoggedIn;
    const organizations = isLoggedIn ? (platformExtState?.userInfo?.organizations ?? []) : undefined;
    const isOrgTouched = useRef(false);
    const [packageNameTouched, setPackageNameTouched] = useState(false);
    const [packageNameError, setPackageNameError] = useState<string | null>(null);
    const [orgNameError, setOrgNameError] = useState<string | null>(null);
    const [isProjectModeSupported, setIsProjectModeSupported] = useState(false);
    const [isProjectSettingsExpanded, setIsProjectSettingsExpanded] = useState(false);
    const [isPackageInfoExpanded, setIsPackageInfoExpanded] = useState(false);
    const resourceTypeLabel = formData.isLibrary ? "Library" : terms.integrationLabel;
    const resourceTypeLabelLower = resourceTypeLabel.toLowerCase();

    const handleIntegrationName = (value: string) => {
        onFormDataChange({ integrationName: value });
        // Auto-populate package name if user hasn't manually edited it
        if (!packageNameTouched) {
            onFormDataChange({ packageName: sanitizePackageName(value) });
        }
    };

    const handleProjectDirSelection = async () => {
        const selectedDirectory = await rpcClient.getCommonRpcClient().selectFileOrDirPath({});
        onFormDataChange({ path: selectedDirectory.path });
    };

    const handleProjectSettingsToggle = () => {
        setIsProjectSettingsExpanded(!isProjectSettingsExpanded);
    };

    const projectTypeNote = formData.createAsWorkspace
        ? `This sets the type for your first ${resourceTypeLabelLower}. You can add more ${terms.integrationNounPlural} or libraries to this project later.`
        : undefined;

    useEffect(() => {
        (async () => {
            const commonRpcClient = rpcClient.getCommonRpcClient();

            // Set default path if not already set
            if (!formData.path) {
                const currentDir = await commonRpcClient.getWorkspaceRoot();
                onFormDataChange({ path: currentDir.path });
            }

            // Set default org name if not already set and no orgs from platform
            if (!formData.orgName && !organizations?.length) {
                try {
                    const { orgName } = await commonRpcClient.getDefaultOrgName();
                    onFormDataChange({ orgName });
                } catch (error) {
                    console.error("Failed to fetch default org name:", error);
                }
            }

            const projectModeSupported = await rpcClient
                .getLangClientRpcClient()
                .isSupportedSLVersion({ major: 2201, minor: 13, patch: 0 })
                .catch((err) => {
                    console.error("Failed to check project mode support:", err);
                    return false;
                });
            setIsProjectModeSupported(projectModeSupported);
        })();
    }, []);

    useEffect(() => {
        if (isOrgTouched.current || !organizations?.length) return;
        onFormDataChange({ orgName: organizations[0].handle });
    }, [organizations]);

    useEffect(() => {
        const error = validatePackageName(formData.packageName, formData.integrationName);
        setPackageNameError(error);
    }, [formData.packageName, formData.integrationName]);

    // Validation effect for org name
    useEffect(() => {
        const orgError = validateOrgName(formData.orgName);
        setOrgNameError(orgError);
    }, [formData.orgName]);

    return (
        <>
            {/* Primary Fields - Always Visible */}
            <FieldGroup>
                <TextField
                    onTextChange={handleIntegrationName}
                    value={formData.integrationName}
                    label={`${resourceTypeLabel} Name`}
                    placeholder={`Enter a ${resourceTypeLabelLower} name`}
                    autoFocus={true}
                    required={true}
                    errorMsg={integrationNameError || ""}
                />
            </FieldGroup>

            <FieldGroup>
                <DirectorySelector
                    id="project-folder-selector"
                    label="Select Path"
                    placeholder="Enter path or browse to select a folder..."
                    selectedPath={formData.path}
                    required={true}
                    onSelect={handleProjectDirSelection}
                    onChange={(value) => onFormDataChange({ path: value })}
                    errorMsg={pathError || undefined}
                />

                <CheckboxContainer>
                    <CheckBox
                        label={`Create a new directory using the ${formData.createAsWorkspace ? "project name" : `${resourceTypeLabel.toLowerCase()} name`}`}
                        checked={formData.createDirectory}
                        onChange={(checked) => onFormDataChange({ createDirectory: checked })}
                    />
                </CheckboxContainer>
            </FieldGroup>

            <FieldGroup>
                <ProjectTypeSelector
                    value={formData.isLibrary}
                    onChange={(isLibrary) => onFormDataChange({ isLibrary })}
                    options={projectTypeOptions(terms)}
                    note={projectTypeNote}
                />
            </FieldGroup>

            <SectionDivider />
            <OptionalSectionsLabel>Optional Configurations</OptionalSectionsLabel>

            {/* Project Section */}
            {isProjectModeSupported && (
                <CollapsibleSection
                    isExpanded={isProjectSettingsExpanded}
                    onToggle={handleProjectSettingsToggle}
                    icon="folder"
                    title="Project"
                >
                    <CheckboxContainer>
                        <CheckBox
                            label="Create as project"
                            checked={formData.createAsWorkspace}
                            onChange={(checked) => onFormDataChange({ createAsWorkspace: checked })}
                        />
                        <Description>
                            Enable project mode to manage multiple integrations and libraries within a single repository.
                        </Description>
                    </CheckboxContainer>
                    {formData.createAsWorkspace && (
                        <FieldGroup>
                            <TextField
                                onTextChange={(value) => onFormDataChange({ workspaceName: value })}
                                value={formData.workspaceName}
                                label="Project Name"
                                placeholder="Enter project name"
                                required={true}
                                errorMsg={projectNameError || ""}
                            />
                        </FieldGroup>
                    )}
                </CollapsibleSection>
            )}

            {/* Ballerina Package Section */}
            <AdvancedConfigurationSection
                isExpanded={isPackageInfoExpanded}
                onToggle={() => setIsPackageInfoExpanded(!isPackageInfoExpanded)}
                data={{ packageName: formData.packageName, orgName: formData.orgName, version: formData.version }}
                onChange={(data) => {
                    onFormDataChange(data);
                    if (data.packageName !== undefined) {
                        setPackageNameTouched(true);
                    }
                    if (data.orgName !== undefined) {
                        isOrgTouched.current = true;
                    }
                }}
                isLibrary={formData.isLibrary}
                orgNameError={orgNameError}
                packageNameError={packageNameValidationError || packageNameError}
                organizations={organizations}
            />
        </>
    );
}
