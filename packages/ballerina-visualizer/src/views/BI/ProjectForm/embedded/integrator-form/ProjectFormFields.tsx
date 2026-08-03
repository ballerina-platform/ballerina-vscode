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

import { useEffect, useState, useRef, useMemo } from "react";
import debounce from "lodash/debounce";
import { TextField, CheckBox } from "@wso2/ui-toolkit";
import { DirectorySelector } from "./components/DirectorySelector/DirectorySelector";
import { useVisualizerContext } from "./context/WsClientContext";
import { useCloudContext, useCloudProjects, useProjectModeSupportedStatus, useWorkspaceRoot } from "./providers";
import {
    FieldGroup,
    Description,
    SectionDivider,
    ResolvedPathText,
    ProjectSectionContainer,
    ProjectSectionLabel,
    ProjectFieldCollapse,
    SkipOptionRow,
    CloudErrorActionRow,
    ActionLink,
} from "./styles";
import { AdvancedConfigurationSection } from "./components";
import { Organization } from "./components/AdvancedConfigurationSection";
import { sanitizePackageName, validatePackageName, validateOrgName, joinPath, sanitizeProjectHandle, validateProjectHandle, suggestAvailableProjectName, validateComponentName, validateProjectName } from "./utils";
import { WICommandIds } from "./shims/platform-core";
import { DEFAULT_PROJECT_NAME, ProjectFormData } from "./types";
import { useRealtimeProjectPathValidation } from "./useRealtimeProjectPathValidation";

// Re-export for backwards compatibility
export type { ProjectFormData } from "./types";


export interface ProjectFormFieldsProps {
    formData: ProjectFormData;
    onFormDataChange: (data: Partial<ProjectFormData>) => void;
    integrationNameError?: string;
    pathError?: string;
    projectNameError?: string;
    packageNameValidationError?: string;
    projectHandleError?: string;
    orgNameError?: string | null;
    expandAdvancedTrigger?: number;
    organizations?: Organization[];
    onCloudProjectNameError?: (error: string | null) => void;
    onCloudProjectHandleError?: (error: string | null) => void;
    onHasErrors?: (hasErrors: boolean) => void;
}

export function ProjectFormFields({
    formData,
    onFormDataChange,
    integrationNameError,
    pathError,
    projectNameError,
    packageNameValidationError,
    projectHandleError,
    orgNameError: orgNameErrorOverride,
    expandAdvancedTrigger,
    organizations,
    onCloudProjectNameError,
    onCloudProjectHandleError,
    onHasErrors,
}: ProjectFormFieldsProps) {
    const { wsClient } = useVisualizerContext();
    const { authState } = useCloudContext();
    const { supported: isProjectModeSupported, isResolved: isProjectModeResolved } = useProjectModeSupportedStatus();
    const { path: workspacePath, isReady: workspaceReady } = useWorkspaceRoot();
    const [packageNameTouched, setPackageNameTouched] = useState(false);
    const [withinProjectNameTouched, setWithinProjectNameTouched] = useState(false);
    const withinProjectNameTouchedRef = useRef(false);
    const [packageNameError, setPackageNameError] = useState<string | null>(null);
    const [integrationNameValidationError, setIntegrationNameValidationError] = useState<string | null>(null);
    const [withinProjectNameValidationError, setWithinProjectNameValidationError] = useState<string | null>(null);
    const [pathValidationError, setPathValidationError] = useState<string | null>(null);
    const [orgNameError, setOrgNameError] = useState<string | null>(null);
    const [handleError, setHandleError] = useState<string | null>(null);
    const [cloudProjectNameError, setCloudProjectNameError] = useState<string | null>(null);
    const [cloudProjectHandleError, setCloudProjectHandleError] = useState<string | null>(null);
    const [matchedCloudProject, setMatchedCloudProject] = useState<{ project: any; org: any } | null>(null);
    const [isPackageInfoExpanded, setIsPackageInfoExpanded] = useState(false);
    const [defaultPath, setDefaultPath] = useState("");
    const [pathTouched, setPathTouched] = useState(false);
    const [editablePath, setEditablePath] = useState("");
    const hasUserToggledCreateWithinProject = useRef(false);
    const hasAutoInitializedProjectMode = useRef(false);
    const handleTouched = useRef(false);
    const firstFieldRef = useRef<HTMLInputElement>(null);
    const orgNameInitialized = useRef(false);

    const loggedInOrgs = authState?.userInfo?.organizations as Array<{ id?: any; handle: string; name: string }> | undefined;
    const resolvedOrg = useMemo(() => {
        if (!loggedInOrgs || loggedInOrgs.length === 0) return undefined;
        return formData.orgName
            ? (loggedInOrgs.find(o => o.handle === formData.orgName) ?? loggedInOrgs[0])
            : loggedInOrgs[0];
    }, [loggedInOrgs, formData.orgName]);

    const { data: cloudProjectsData } = useCloudProjects(
        resolvedOrg?.id?.toString(),
        resolvedOrg?.handle
    );

    const debouncedSetIntegrationNameError = useMemo(
        () => debounce((error: string) => setIntegrationNameValidationError(error), 300),
        []
    );
    const debouncedSetWithinProjectNameError = useMemo(
        () => debounce((error: string) => setWithinProjectNameValidationError(error), 300),
        []
    );

    const computeDisplayedPath = (): string => {
        const base = editablePath;
        if (formData.createWithinProject) {
            const projectPath = formData.projectHandle
                ? joinPath(base, formData.projectHandle)
                : base;
            return formData.packageName ? joinPath(projectPath, formData.packageName) : projectPath;
        }
        return joinPath(base, formData.packageName);
    };

    const resolvedPath = computeDisplayedPath();

    useEffect(() => {
        if (!pathTouched) {
            setEditablePath(formData.path || defaultPath);
        }
    }, [formData.path, defaultPath, pathTouched]);

    const handleIntegrationName = (value: string) => {
        setPathTouched(false);
        const updates: Partial<ProjectFormData> = { integrationName: value };
        if (!packageNameTouched) {
            const sanitized = sanitizePackageName(value);
            updates.packageName = sanitized;
        }
        onFormDataChange(updates);
    };

    const handleProjectDirSelection = async () => {
        try {
            const selectedDirectory = await wsClient.selectFileOrDirPath({ startPath: editablePath || formData.path || defaultPath });
            if (!selectedDirectory.path) return;
            setPathTouched(false);
            setEditablePath(selectedDirectory.path);
            onFormDataChange({ path: selectedDirectory.path });
        } catch (error) {
            console.error("Failed to select directory:", error);
            return;
        }
    };

    const handleCreateWithinProjectToggle = (checked: boolean) => {
        hasUserToggledCreateWithinProject.current = true;
        setPathTouched(false);
        if (checked) {
            const projectName = formData.withinProjectName || DEFAULT_PROJECT_NAME;
            const handle = handleTouched.current ? formData.projectHandle : sanitizeProjectHandle(projectName);
            onFormDataChange({ createWithinProject: true, withinProjectName: projectName, projectHandle: handle });
        } else {
            handleTouched.current = false;
            onFormDataChange({ createWithinProject: false, withinProjectName: "", projectHandle: "" });
        }
    };

    useEffect(() => {
        if (!workspaceReady) return;
        (async () => {
            if (!formData.path) {
                try {
                    const dp = workspacePath || (await wsClient.getDefaultCreationPath()).path;
                    setDefaultPath(dp);
                    onFormDataChange({ path: dp });
                } catch (error) {
                    console.error("Failed to fetch default creation path:", error);
                    if (workspacePath) {
                        setDefaultPath(workspacePath);
                        onFormDataChange({ path: workspacePath });
                    }
                }
            }
            if (!orgNameInitialized.current) {
                orgNameInitialized.current = true;
                if (organizations && organizations.length > 0) {
                    onFormDataChange({ orgName: organizations[0].handle });
                } else {
                    try {
                        const { orgName } = await wsClient.getDefaultOrgName();
                        onFormDataChange({ orgName });
                    } catch (error) {
                        console.error("Failed to fetch default org name:", error);
                    }
                }
            }
            if (
                !hasAutoInitializedProjectMode.current &&
                !hasUserToggledCreateWithinProject.current &&
                // Wait for the confirmed value — acting on the optimistic placeholder
                // could auto-enable project mode on a runtime that doesn't support it.
                isProjectModeResolved &&
                isProjectModeSupported
            ) {
                hasAutoInitializedProjectMode.current = true;
                const updates: Partial<ProjectFormData> = { createWithinProject: true };
                if (!formData.withinProjectName) {
                    updates.withinProjectName = DEFAULT_PROJECT_NAME;
                }
                onFormDataChange(updates);
            }
        })();
    }, [
        workspaceReady,
        wsClient,
        workspacePath,
        isProjectModeSupported,
        isProjectModeResolved,
        formData.path,
        formData.packageName,
        formData.withinProjectName,
        formData.createWithinProject,
        onFormDataChange,
        organizations,
    ]);

    useEffect(() => {
        const error = validatePackageName(formData.packageName, formData.integrationName);
        setPackageNameError(error);
    }, [formData.packageName, formData.integrationName]);

    // Real-time integration name validation
    useEffect(() => {
        const error = validateComponentName(formData.integrationName);
        if (!error) {
            debouncedSetIntegrationNameError.cancel();
            setIntegrationNameValidationError(null);
            return;
        }
        debouncedSetIntegrationNameError(error);
        return () => debouncedSetIntegrationNameError.cancel();
    }, [formData.integrationName]);

    // Real-time project name validation
    useEffect(() => {
        if (!formData.createWithinProject) {
            debouncedSetWithinProjectNameError.cancel();
            setWithinProjectNameValidationError(null);
            return;
        }
        const error = validateProjectName(formData.withinProjectName?.trim() ?? "");
        if (!error) {
            debouncedSetWithinProjectNameError.cancel();
            setWithinProjectNameValidationError(null);
            return;
        }
        debouncedSetWithinProjectNameError(error);
        return () => debouncedSetWithinProjectNameError.cancel();
    }, [formData.withinProjectName, formData.createWithinProject]);

    useRealtimeProjectPathValidation({
        wsClient,
        projectPath: editablePath,
        projectName: formData.createWithinProject ? formData.projectHandle : formData.packageName,
        createAsWorkspace: formData.createWithinProject,
        pathTouched,
        requiredPathMessage: "Please select a path",
        invalidPathMessage: "Invalid integration path",
        onPathErrorChange: setPathValidationError,
    });

    useEffect(() => {
        if (expandAdvancedTrigger) {
            setIsPackageInfoExpanded(true);
        }
    }, [expandAdvancedTrigger]);

    // Validation effect for org name
    useEffect(() => {
        // If the parent provided an explicit org name error, show it immediately.
        // Otherwise, validate locally as the user edits.
        if (orgNameErrorOverride !== undefined) {
            setOrgNameError(orgNameErrorOverride);
            return;
        }

        setOrgNameError(validateOrgName(formData.orgName));
    }, [formData.orgName, orgNameErrorOverride]);

    // Auto-derive projectHandle from withinProjectName unless the user has manually edited it
    useEffect(() => {
        if (handleTouched.current) return;
        if (formData.createWithinProject && formData.withinProjectName) {
            const derived = sanitizeProjectHandle(formData.withinProjectName);
            if (derived !== formData.projectHandle) {
                onFormDataChange({ projectHandle: derived });
            }
        }
    }, [formData.withinProjectName, formData.createWithinProject]);

    // Validate handle whenever it changes
    useEffect(() => {
        if (formData.createWithinProject) {
            setHandleError(validateProjectHandle(formData.projectHandle));
        } else {
            setHandleError(null);
        }
    }, [formData.projectHandle, formData.createWithinProject]);

    // Validate project name against cached cloud projects — synchronous, no debounce needed.
    useEffect(() => {
        if (!cloudProjectsData?.projects || !formData.createWithinProject || !formData.withinProjectName?.trim()) {
            setCloudProjectNameError(null);
            setMatchedCloudProject(null);
            return;
        }
        const nameToCheck = formData.withinProjectName.trim().toLowerCase();
        const matched = cloudProjectsData.projects.find((p: any) => p.name.toLowerCase() === nameToCheck);
        if (matched) {
            const suggested = suggestAvailableProjectName(
                formData.withinProjectName.trim(),
                cloudProjectsData.projects.map((p: any) => p.name)
            );
            if (!withinProjectNameTouchedRef.current) {
                // Default name conflicts — silently auto-rename
                onFormDataChange({ withinProjectName: suggested });
                setCloudProjectNameError(null);
                setMatchedCloudProject(null);
            } else {
                setCloudProjectNameError("A project with this name already exists in cloud");
                setMatchedCloudProject({ project: matched, org: resolvedOrg });
            }
        } else {
            setCloudProjectNameError(null);
            setMatchedCloudProject(null);
        }
    }, [cloudProjectsData, formData.withinProjectName, formData.createWithinProject]);

    useEffect(() => {
        onCloudProjectNameError?.(cloudProjectNameError);
    }, [cloudProjectNameError]);

    // Validate project handle against cached cloud project handles
    useEffect(() => {
        if (!cloudProjectsData?.projects || !formData.createWithinProject || !formData.projectHandle?.trim()) {
            setCloudProjectHandleError(null);
            return;
        }
        const handleToCheck = formData.projectHandle.trim().toLowerCase();
        const matched = cloudProjectsData.projects.find((p: any) => p.handler.toLowerCase() === handleToCheck);
        if (matched) {
            const suggested = suggestAvailableProjectName(
                formData.projectHandle.trim(),
                cloudProjectsData.projects.map((p: any) => p.handler)
            );
            if (!handleTouched.current) {
                onFormDataChange({ projectHandle: suggested });
                setCloudProjectHandleError(null);
            } else {
                setCloudProjectHandleError("A project with this id already exists in cloud");
            }
        } else {
            setCloudProjectHandleError(null);
        }
    }, [cloudProjectsData, formData.projectHandle, formData.createWithinProject]);

    useEffect(() => {
        onCloudProjectHandleError?.(cloudProjectHandleError);
    }, [cloudProjectHandleError]);

    // Propagate aggregated error state to the parent so it can disable its submit button.
    useEffect(() => {
        const hasAnyError = !!(
            integrationNameError ||
            integrationNameValidationError ||
            withinProjectNameValidationError ||
            pathError ||
            pathValidationError ||
            projectNameError ||
            packageNameValidationError ||
            packageNameError ||
            projectHandleError ||
            orgNameError ||
            handleError ||
            cloudProjectNameError ||
            cloudProjectHandleError
        );
        onHasErrors?.(hasAnyError);
    }, [
        integrationNameError,
        integrationNameValidationError,
        withinProjectNameValidationError,
        pathError,
        pathValidationError,
        projectNameError,
        packageNameValidationError,
        packageNameError,
        projectHandleError,
        orgNameError,
        handleError,
        cloudProjectNameError,
        cloudProjectHandleError
    ]);

    // Focus and select the first field on mount — VSCodeTextField is a web component,
    // so the real <input> is inside its shadow DOM and needs to be targeted directly.
    useEffect(() => {
        setTimeout(() => {
            const inner = (firstFieldRef.current as any)?.shadowRoot?.querySelector("input") as HTMLInputElement | null;
            inner?.focus();
            inner?.select();
        }, 0);
    }, []);

    return (
        <>
            {/* Primary Fields - Always Visible */}
            <FieldGroup>
                <TextField
                    ref={firstFieldRef}
                    onTextChange={handleIntegrationName}
                    value={formData.integrationName}
                    label={`Integration Name`}
                    placeholder={`Enter an integration name`}
                    required={true}
                    errorMsg={integrationNameError || integrationNameValidationError || ""}
                />
            </FieldGroup>

            {/* Project Name - shown by default when project mode is supported */}
            {isProjectModeSupported && (
                <ProjectSectionContainer>
                    <ProjectSectionLabel>Project</ProjectSectionLabel>
                    <ProjectFieldCollapse isVisible={formData.createWithinProject}>
                        <TextField
                            onTextChange={(value) => {
                                setWithinProjectNameTouched(true);
                                withinProjectNameTouchedRef.current = true;
                                setPathTouched(false);
                                onFormDataChange({ withinProjectName: value });
                            }}
                            value={formData.withinProjectName}
                            label="Project Name"
                            placeholder="Enter project name"
                            required={true}
                            errorMsg={projectNameError ?? (withinProjectNameValidationError ?? (cloudProjectNameError ?? ""))}
                        />
                        {cloudProjectNameError && (
                            <CloudErrorActionRow>
                                {matchedCloudProject && (
                                    <ActionLink type="button" onClick={() =>
                                        wsClient.runCommand({
                                            command: WICommandIds.CloneProject,
                                            args: [{ organization: matchedCloudProject.org, project: matchedCloudProject.project, integrationOnly: true }],
                                        })
                                    }>
                                        Open existing project
                                    </ActionLink>
                                )}
                            </CloudErrorActionRow>
                        )}
                    </ProjectFieldCollapse>
                    <SkipOptionRow>
                        <CheckBox
                            label="Create within a project"
                            checked={formData.createWithinProject}
                            onChange={handleCreateWithinProjectToggle}
                        />
                        <Description style={{ marginTop: "6px" }}>
                            Enable project mode to manage multiple integrations and libraries within a single repository.
                        </Description>
                    </SkipOptionRow>
                </ProjectSectionContainer>
            )}

            <FieldGroup>
                <DirectorySelector
                    id="project-folder-selector"
                    label="Select Path"
                    placeholder="Browse to select a folder..."
                    selectedPath={editablePath}
                    required={true}
                    onSelect={handleProjectDirSelection}
                    onChange={(value) => {
                        setPathTouched(true);
                        setEditablePath(value);
                        onFormDataChange({ path: value });
                    }}
                    errorMsg={pathError || pathValidationError || undefined}
                />
                {resolvedPath && resolvedPath !== editablePath && (
                    <ResolvedPathText>Will be created at: {resolvedPath}</ResolvedPathText>
                )}
            </FieldGroup>

            <SectionDivider />

            <AdvancedConfigurationSection
                isExpanded={isPackageInfoExpanded}
                onToggle={() => setIsPackageInfoExpanded(!isPackageInfoExpanded)}
                data={{
                    packageName: formData.packageName,
                    orgName: formData.orgName,
                    version: formData.version,
                    projectHandle: formData.createWithinProject ? formData.projectHandle : undefined,
                }}
                onChange={(data) => {
                    if (data.projectHandle !== undefined) {
                        handleTouched.current = true;
                        if (handleError) setHandleError(null);
                        onFormDataChange({ projectHandle: data.projectHandle });
                        return;
                    }
                    if (data.packageName !== undefined) {
                        setPackageNameTouched(data.packageName.length > 0);
                        if (packageNameError) setPackageNameError(null);
                        setPathTouched(false);
                        const updates: Partial<ProjectFormData> = { ...data };
                        if (!withinProjectNameTouched && !formData.withinProjectName) {
                            updates.withinProjectName = DEFAULT_PROJECT_NAME;
                        }
                        onFormDataChange(updates);
                        return;
                    }
                    onFormDataChange(data);
                }}
                orgNameError={orgNameError}
                packageNameError={packageNameValidationError || packageNameError}
                projectHandleError={projectHandleError || handleError || cloudProjectHandleError}
                organizations={organizations}
                hasError={!!(packageNameValidationError || packageNameError || orgNameError || projectHandleError || handleError || cloudProjectHandleError)}
            />
        </>
    );
}
