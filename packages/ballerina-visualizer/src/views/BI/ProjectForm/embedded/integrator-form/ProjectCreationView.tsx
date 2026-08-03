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

import { useState, useEffect, useRef, useMemo } from "react";
import debounce from "lodash/debounce";
import { Button, Icon, TextField } from "@wso2/ui-toolkit";
import { useVisualizerContext } from "./context/WsClientContext";
import { useCloudContext, useCloudProjects } from "./providers";
import { useSignIn } from "./hooks/useSignIn";
import { DirectorySelector } from "./components/DirectorySelector/DirectorySelector";
import {
    joinPath,
    sanitizeProjectHandle,
    sanitizeOrgHandle,
    validateProjectHandle,
    validateProjectName,
    validateOrgName,
    suggestAvailableProjectName
} from "./utils";
import { WICommandIds } from "./shims/platform-core";
import { CollapsibleSection, OrgField, Organization } from "./components";
import { ValidateProjectFormErrorField } from "./shims/wi-core";
import { useRealtimeProjectPathValidation } from "./useRealtimeProjectPathValidation";
import {
    PageBackdrop,
    PageContainer,
    HeaderRow,
    BackButton,
    HeaderText,
    HeaderTitle,
    HeaderSubtitle,
    FormPanel,
    FormPanelHeader,
    FormBody,
    FormContent,
    FormFooter,
} from "./shared/FormPageLayout";
import {
    ResolvedPathText,
    CloudErrorActionRow,
    ActionLink,
    Description,
    FieldGroup,
} from "./styles";
import { DEFAULT_PROJECT_NAME } from "./types";


export function ProjectCreationView({ onBack, ballerinaUnavailable }: { onBack?: () => void; ballerinaUnavailable?: boolean }) {
    const { wsClient } = useVisualizerContext();
    const { authState } = useCloudContext();
    const organizations = authState?.userInfo?.organizations as Organization[] | undefined;
    const firstFieldRef = useRef<HTMLInputElement>(null);
    const handleTouched = useRef(false);
    const projectNameTouchedRef = useRef(false);
    const orgNameInitialized = useRef(false);
    const defaultPathInitialized = useRef(false);
    const [isValidating, setIsValidating] = useState(false);
    const [projectNameError, setProjectNameError] = useState<string | null>(null);
    const [pathError, setPathError] = useState<string | null>(null);
    const [projectHandleError, setProjectHandleError] = useState<string | null>(null);
    const [cloudProjectNameError, setCloudProjectNameError] = useState<string | null>(null);
    const [cloudProjectHandleError, setCloudProjectHandleError] = useState<string | null>(null);
    const [matchedCloudProject, setMatchedCloudProject] = useState<{ project: any; org: any } | null>(null);
    const [orgNameError, setOrgNameError] = useState<string | null>(null);
    const { isSigningIn, handleSignIn, handleCancelSignIn } = useSignIn();
    const [isAdvancedExpanded, setIsAdvancedExpanded] = useState(false);
    const [projectHandle, setProjectHandle] = useState(() => sanitizeProjectHandle(DEFAULT_PROJECT_NAME));
    const [defaultPath, setDefaultPath] = useState("");
    const [pathTouched, setPathTouched] = useState(false);
    const [editablePath, setEditablePath] = useState("");
    const [formData, setFormData] = useState({
        projectName: DEFAULT_PROJECT_NAME,
        path: "",
        orgName: "",
        version: "",
    });

    const debouncedSetProjectNameError = useMemo(
        () => debounce((error: string) => setProjectNameError(error), 300),
        []
    );

    const resolvedOrg = useMemo(() => {
        if (!organizations || organizations.length === 0) return undefined;
        return formData.orgName
            ? (organizations.find(o => o.handle === formData.orgName) ?? organizations[0])
            : organizations[0];
    }, [organizations, formData.orgName]);

    const { data: cloudProjectsData } = useCloudProjects(
        resolvedOrg?.id?.toString(),
        resolvedOrg?.handle
    );

    useEffect(() => {
        let mounted = true;
        (async () => {
            // Seed the default path only once. This effect also re-runs when the async
            // cloud `organizations` list arrives/changes; without this guard it would
            // overwrite a path the user has since chosen via Browse or by typing.
            if (!defaultPathInitialized.current) {
                try {
                    const { path: workspacePath } = await wsClient.getWorkspaceRoot();
                    if (!mounted) return;
                    const dp = workspacePath || (await wsClient.getDefaultCreationPath()).path;
                    if (!mounted) return;
                    defaultPathInitialized.current = true;
                    setDefaultPath(dp);
                    setFormData(prev => ({ ...prev, path: dp }));
                } catch (error) {
                    console.error("Failed to fetch default path:", error);
                }
            }

            if (!orgNameInitialized.current) {
                orgNameInitialized.current = true;
                if (organizations && organizations.length > 0) {
                    if (mounted) setFormData(prev => ({ ...prev, orgName: organizations[0].handle }));
                } else {
                    try {
                        const { orgName } = await wsClient.getDefaultOrgName();
                        if (mounted) setFormData(prev => ({ ...prev, orgName }));
                    } catch (error) {
                        console.error("Failed to fetch default organization name:", error);
                    }
                }
            }
        })();
        return () => { mounted = false; };
    }, [organizations, wsClient]);

    // Validate project handle against cached cloud project handles
    useEffect(() => {
        if (!cloudProjectsData?.projects || !projectHandle?.trim()) {
            setCloudProjectHandleError(null);
            return;
        }
        const handleToCheck = projectHandle.trim().toLowerCase();
        const matched = cloudProjectsData.projects.find((p: any) => p.handler.toLowerCase() === handleToCheck);
        if (matched) {
            const suggested = suggestAvailableProjectName(
                projectHandle.trim(),
                cloudProjectsData.projects.map((p: any) => p.handler)
            );
            if (!handleTouched.current) {
                setProjectHandle(suggested);
                setCloudProjectHandleError(null);
            } else {
                setCloudProjectHandleError("A project with this id already exists in cloud");
            }
        } else {
            setCloudProjectHandleError(null);
        }
    }, [cloudProjectsData, projectHandle]);

    // Focus and select the first field on mount — VSCodeTextField is a web component,
    // so the real <input> is inside its shadow DOM and needs to be targeted directly.
    useEffect(() => {
        setTimeout(() => {
            const inner = (firstFieldRef.current as any)?.shadowRoot?.querySelector("input") as HTMLInputElement | null;
            inner?.focus();
            inner?.select();
        }, 0);
    }, []);

    // Auto-derive handle from projectName unless manually edited
    useEffect(() => {
        if (handleTouched.current) return;
        const derived = sanitizeProjectHandle(formData.projectName);
        setProjectHandle(derived);
    }, [formData.projectName]);

    // Real-time project name validation — clear immediately when valid, debounce errors
    // to avoid flashing "required" on every keystroke before the user finishes typing.
    useEffect(() => {
        const error = validateProjectName(formData.projectName);
        if (!error) {
            debouncedSetProjectNameError.cancel();
            setProjectNameError(null);
            return;
        }
        debouncedSetProjectNameError(error);
        return () => debouncedSetProjectNameError.cancel();
    }, [formData.projectName]);

    // Real-time org name validation (mirrors LibraryCreationView behaviour)
    useEffect(() => {
        setOrgNameError(validateOrgName(formData.orgName));
    }, [formData.orgName]);

    // Validate handle
    useEffect(() => {
        setProjectHandleError(validateProjectHandle(projectHandle));
    }, [projectHandle]);

    // Validate project name against cached cloud projects — synchronous, no debounce needed.
    useEffect(() => {
        if (!cloudProjectsData?.projects || !formData.projectName?.trim()) {
            setCloudProjectNameError(null);
            setMatchedCloudProject(null);
            return;
        }
        const nameToCheck = formData.projectName.trim().toLowerCase();
        const matched = cloudProjectsData.projects.find((p: any) => p.name.toLowerCase() === nameToCheck);
        if (matched) {
            const suggested = suggestAvailableProjectName(
                formData.projectName.trim(),
                cloudProjectsData.projects.map((p: any) => p.name)
            );
            if (!projectNameTouchedRef.current) {
                // Default name conflicts — silently auto-rename
                setFormData(prev => ({ ...prev, projectName: suggested }));
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
    }, [cloudProjectsData, formData.projectName, resolvedOrg]);

    // Keep editablePath in sync with the committed path when the user is not actively editing
    useEffect(() => {
        if (!pathTouched) {
            setEditablePath(formData.path || defaultPath);
        }
    }, [formData.path, defaultPath, pathTouched]);

    useRealtimeProjectPathValidation({
        wsClient,
        projectPath: editablePath,
        projectName: projectHandle,
        createAsWorkspace: true,
        pathTouched,
        requiredPathMessage: "Please select a path for your project",
        invalidPathMessage: "Invalid project path",
        onPathErrorChange: setPathError,
    });

    const resolvedPath = editablePath ? joinPath(editablePath, projectHandle) : "";

    const handlePathSelection = async () => {
        try {
            const result = await wsClient.selectFileOrDirPath({ startPath: editablePath || formData.path || defaultPath });
            if (!result.path) return;
            setPathTouched(false);
            setEditablePath(result.path);
            setFormData(prev => ({ ...prev, path: result.path }));
        } catch (error) {
            console.error("Failed to select path:", error);
            setPathError("Failed to select path. Please try again.");
        }
    };

    const handleCreate = async () => {
        setIsValidating(true);

        // Commit any un-blurred path before submitting
        const currentPath = editablePath || formData.path;
        if (pathTouched && editablePath !== formData.path) {
            setFormData(prev => ({ ...prev, path: editablePath }));
        }

        let hasError = false;

        const nameError = validateProjectName(formData.projectName);
        if (nameError) {
            setProjectNameError(nameError);
            hasError = true;
        }

        const hErr = validateProjectHandle(projectHandle);
        if (hErr) {
            setProjectHandleError(hErr);
            setIsAdvancedExpanded(true);
            hasError = true;
        }

        if (!currentPath || currentPath.trim().length < 2) {
            setPathError("Please select a path for your project");
            hasError = true;
        }

        const orgErr = validateOrgName(formData.orgName);
        if (orgErr) {
            setOrgNameError(orgErr);
            setIsAdvancedExpanded(true);
            hasError = true;
        }

        if (cloudProjectNameError) {
            hasError = true;
        }

        if (cloudProjectHandleError) {
            hasError = true;
        }

        if (hasError) {
            setIsValidating(false);
            return;
        }

        try {
            const validationResult = await wsClient.validateProjectPath({
                projectPath: currentPath,
                projectName: projectHandle,
                createDirectory: true,
                createAsWorkspace: true,
            });

            if (!validationResult.isValid) {
                if (validationResult.errorField === ValidateProjectFormErrorField.PATH) {
                    setPathError(validationResult.errorMessage || "Invalid project path");
                } else if (validationResult.errorField === ValidateProjectFormErrorField.NAME) {
                    setProjectHandleError(validationResult.errorMessage || "Invalid project ID");
                    setIsAdvancedExpanded(true);
                }
                setIsValidating(false);
                return;
            }
        } catch (error) {
            setPathError("An error occurred during validation");
            setIsValidating(false);
            return;
        }

        try {
            const orgHandle = organizations?.find(o => o.handle === formData.orgName)?.handle
                || sanitizeOrgHandle(formData.orgName);

            await wsClient.createBIProject({
                workspaceName: formData.projectName,
                projectPath: currentPath,
                createDirectory: true,
                createAsWorkspace: true,
                orgName: formData.orgName || undefined,
                orgHandle: orgHandle,
                version: formData.version || undefined,
                projectHandle: projectHandle,
            });
        } catch (error) {
            console.error("Failed to create project:", error);
            setPathError(error instanceof Error ? error.message : "Failed to create the project");
        } finally {
            setIsValidating(false);
        }
    };

    return (
        <PageBackdrop>
            <PageContainer>
                <FormPanel>
                    <FormPanelHeader>
                        <HeaderRow>
                            <BackButton type="button" onClick={onBack} title="Go back">
                                <Icon
                                    name="arrow-left"
                                    isCodicon
                                    sx={{ width: "16px", height: "16px", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                                    iconSx={{ color: "var(--vscode-foreground)", fontSize: "16px", lineHeight: 1 }}
                                />
                            </BackButton>
                            <HeaderText>
                                <HeaderTitle variant="h2">Create Project</HeaderTitle>
                                <HeaderSubtitle>
                                    Set up a new multi-integration workspace project.
                                </HeaderSubtitle>
                            </HeaderText>
                        </HeaderRow>
                    </FormPanelHeader>
                    <FormBody>
                        <FormContent>
                            <FieldGroup>
                                <TextField
                                    ref={firstFieldRef}
                                    onTextChange={(value) => {
                                        projectNameTouchedRef.current = true;
                                        setFormData(prev => ({ ...prev, projectName: value }));
                                    }}
                                    value={formData.projectName}
                                    label="Project Name"
                                    placeholder="Enter a project name"
                                    required={true}
                                    errorMsg={projectNameError || cloudProjectNameError || ""}
                                />
                                {cloudProjectNameError && matchedCloudProject && (
                                    <CloudErrorActionRow>
                                        <ActionLink type="button" onClick={() =>
                                            wsClient.runCommand({
                                                command: WICommandIds.CloneProject,
                                                args: [{ organization: matchedCloudProject.org, project: matchedCloudProject.project, integrationOnly: true }],
                                            })
                                        }>
                                            Open existing project
                                        </ActionLink>
                                    </CloudErrorActionRow>
                                )}
                            </FieldGroup>

                            <FieldGroup>
                                <DirectorySelector
                                    id="project-folder-selector"
                                    label="Select Path"
                                    placeholder="Browse to select a folder..."
                                    selectedPath={editablePath}
                                    required={true}
                                    onSelect={handlePathSelection}
                                    onChange={(value) => {
                                        setPathTouched(true);
                                        setEditablePath(value);
                                    }}
                                    onBlur={() => {
                                        if (pathTouched && editablePath !== formData.path) {
                                            setFormData(prev => ({ ...prev, path: editablePath }));
                                        }
                                    }}
                                    errorMsg={pathError || undefined}
                                />
                                {resolvedPath && resolvedPath !== editablePath && (
                                    <ResolvedPathText>Will be created at: {resolvedPath}</ResolvedPathText>
                                )}
                            </FieldGroup>

                            <CollapsibleSection
                                isExpanded={isAdvancedExpanded}
                                onToggle={() => setIsAdvancedExpanded(!isAdvancedExpanded)}
                                icon="gear"
                                title="Advanced Configurations"
                                hasError={!!(orgNameError || projectHandleError || cloudProjectHandleError)}
                            >
                                <FieldGroup>
                                    <OrgField
                                        organizations={organizations}
                                        orgName={formData.orgName}
                                        orgNameError={orgNameError}
                                        description="The organization that owns this project."
                                        isSigningIn={isSigningIn}
                                        onOrgChange={(value) => {
                                            setFormData(prev => ({ ...prev, orgName: value }));
                                        }}
                                        onSignIn={handleSignIn}
                                        onCancelSignIn={handleCancelSignIn}
                                    />
                                </FieldGroup>
                                <FieldGroup>
                                    <TextField
                                        onTextChange={(value) => {
                                            handleTouched.current = true;
                                            if (projectHandleError) setProjectHandleError(null);
                                            setProjectHandle(sanitizeProjectHandle(value, { trimTrailing: false }));
                                        }}
                                        value={projectHandle}
                                        label="Project ID"
                                        errorMsg={projectHandleError || cloudProjectHandleError || ""}
                                    />
                                    <Description>Unique identifier for your project in various contexts.</Description>
                                </FieldGroup>
                            </CollapsibleSection>

                            <FormFooter>
                                <span title={ballerinaUnavailable ? "Ballerina distribution is not set up. Use Configure to set it up." : undefined}>
                                    <Button
                                        disabled={isValidating || ballerinaUnavailable || !!projectNameError || !!cloudProjectNameError || !!cloudProjectHandleError || !!orgNameError || !!projectHandleError || !!pathError}
                                        onClick={handleCreate}
                                        appearance="primary"
                                    >
                                        {isValidating ? "Validating..." : "Create Project"}
                                    </Button>
                                </span>
                            </FormFooter>
                        </FormContent>
                    </FormBody>
                </FormPanel>
            </PageContainer>
        </PageBackdrop>
    );
}
