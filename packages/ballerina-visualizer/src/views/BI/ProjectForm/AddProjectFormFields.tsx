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
import { ProjectTypeSelector } from "./components";
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
 * the starting point to add. Both are named by `AddComponentFields` — the library on
 * the following screen, alongside its package details; the integration inline, rendered
 * by the parent right after this section and created empty from this same screen.
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
    const resourceTypeLabel = formData.isLibrary ? "Library" : "Integration";
    const resourceTypeLabelLower = resourceTypeLabel.toLowerCase();
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
                            Your current integration becomes the first member of this project.
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
                            The project folder is created here and your current integration is moved into it.
                        </Description>
                    </FieldGroup>

                    <InlineToggle>
                        <CheckBox
                            label="Also add a new integration or library"
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
                    />

                    {/* The integration is named by the field the parent renders directly
                        below this section and created empty from here; only the library
                        still has a screen of its own. Matches the initial Create flow. */}
                    {formData.isLibrary && (
                        <Description>
                            You'll name and configure your {resourceTypeLabelLower} in the next step.
                        </Description>
                    )}
                </FormSection>
            )}
        </>
    );
}
