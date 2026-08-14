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

import { CheckBox, DirectorySelector, TextField } from "@wso2/ui-toolkit";
import {
    Description,
    FieldGroup,
    FormSection,
    FormSectionHeader,
    FormSectionTitle,
    FormSectionCaption,
    InlineToggle,
} from "./styles";
import { ProductMode } from "@wso2/ballerina-core";
import { ProjectTypeSelector } from "./components";
import { projectTypeOptions } from "./copy";
import { useCreateFlowCopy } from "./useCreateFlowCopy";
import { useProductMode } from "../../../hooks/useProductMode";
import { AddProjectFormData } from "./types";
import { sanitizeProjectHandle } from "./utils";

// Re-export for backwards compatibility
export type { AddProjectFormData } from "./types";

export interface AddProjectFormFieldsProps {
    formData: AddProjectFormData;
    onFormDataChange: (data: Partial<AddProjectFormData>) => void;
    isInProject: boolean;
    addNewAfterConvert: boolean;
    onAddNewAfterConvertChange: (value: boolean) => void;
    projectNameValidationError?: string;
    /** Full destination path (location + folder name) for the convert flow. */
    convertPath?: string;
    onConvertPathChange?: (value: string) => void;
    onConvertPathSelect?: () => void;
    convertPathError?: string;
}

/**
 * Screen 1 of the Add-to-project flow: the project itself (convert case only) and
 * the starting point to add. Both starting points are named and configured on the
 * following screen — the integration in the Create Integration wizard, the library
 * in `AddLibraryFields` — so nothing artifact-specific is collected here.
 */
export function AddProjectFormFields({
    formData,
    onFormDataChange,
    isInProject,
    addNewAfterConvert,
    onAddNewAfterConvertChange,
    projectNameValidationError,
    convertPath,
    onConvertPathChange,
    onConvertPathSelect,
    convertPathError,
}: AddProjectFormFieldsProps) {
    const copy = useCreateFlowCopy();
    const resourceTypeLabel = formData.isLibrary ? "Library" : copy.integrationLabel;
    const resourceTypeLabelLower = resourceTypeLabel.toLowerCase();
    // Agent Builder's integration wizard collapses to its Name step; a library still
    // configures on the next screen.
    const namesOnlyNextStep = useProductMode() === ProductMode.AGENT_BUILDER && !formData.isLibrary;
    const showIntegrationFields = isInProject || addNewAfterConvert;

    const handleProjectName = (value: string) => {
        // The project name also seeds the default destination folder name (via the
        // derived handle); the folder itself is editable through the Project Location
        // field, so there is no separate Project ID field to keep in sync here.
        onFormDataChange({
            workspaceName: value,
            projectHandle: sanitizeProjectHandle(value, { trimTrailing: false }),
        });
    };

    return (
        <>
            {!isInProject && (
                <FormSection>
                    <FormSectionHeader>
                        <FormSectionTitle>Project</FormSectionTitle>
                        <FormSectionCaption>
                            Your current {copy.integrationNoun} becomes the first member of this project.
                        </FormSectionCaption>
                    </FormSectionHeader>

                    <FieldGroup>
                        <TextField
                            onTextChange={handleProjectName}
                            value={formData.workspaceName}
                            label="Project Name"
                            placeholder="Enter project name"
                            autoFocus={true}
                            required={true}
                            errorMsg={projectNameValidationError || ""}
                        />
                    </FieldGroup>

                    <FieldGroup>
                        <DirectorySelector
                            id="convert-project-folder-selector"
                            label="Project Location"
                            placeholder="Enter path or browse to select a folder..."
                            selectedPath={convertPath || ""}
                            required={true}
                            onSelect={() => onConvertPathSelect?.()}
                            onChange={(value) => onConvertPathChange?.(value)}
                            errorMsg={convertPathError || undefined}
                        />
                        <Description>
                            The project folder is created here and your current {copy.integrationNoun} is moved into it.
                        </Description>
                    </FieldGroup>

                    <InlineToggle>
                        <CheckBox
                            label={`Also add a new ${copy.integrationNoun} or library`}
                            checked={addNewAfterConvert}
                            onChange={onAddNewAfterConvertChange}
                        />
                    </InlineToggle>
                </FormSection>
            )}

            {showIntegrationFields && (
                <FormSection>
                    {!isInProject && (
                        <FormSectionHeader>
                            <FormSectionTitle>New {resourceTypeLabel}</FormSectionTitle>
                            <FormSectionCaption>
                                Scaffold a new {resourceTypeLabelLower} as part of this project.
                            </FormSectionCaption>
                        </FormSectionHeader>
                    )}

                    <ProjectTypeSelector
                        value={formData.isLibrary}
                        onChange={(isLibrary) => onFormDataChange({ isLibrary })}
                        options={projectTypeOptions(copy)}
                    />

                    {/* Both starting points are named and configured on the next screen,
                        matching the initial Create experience — except an Agent Builder
                        integration, which is only named there. */}
                    <Description>
                        {namesOnlyNextStep
                            ? `You'll name your ${resourceTypeLabelLower} in the next step.`
                            : `You'll name and configure your ${resourceTypeLabelLower} in the next step.`}
                    </Description>
                </FormSection>
            )}
        </>
    );
}
