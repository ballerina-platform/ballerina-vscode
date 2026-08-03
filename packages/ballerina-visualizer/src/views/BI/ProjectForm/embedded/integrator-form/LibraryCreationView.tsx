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
import { Button, Icon, TextField, CheckBox } from "@wso2/ui-toolkit";
import styled from "@emotion/styled";
import { useVisualizerContext } from "./context/WsClientContext";
import { useCloudContext, useCloudProjects, useProjectModeSupported, useWorkspaceRoot } from "./providers";
import {
    sanitizePackageName,
    validateComponentName,
    validatePackageName,
    validateOrgName,
    joinPath,
    sanitizeProjectHandle,
    sanitizeOrgHandle,
    validateProjectHandle,
    validateProjectName,
    suggestAvailableProjectName
} from "./utils";
import { WICommandIds } from "./shims/platform-core";
import { DirectorySelector } from "./components/DirectorySelector/DirectorySelector";
import { AdvancedConfigurationSection } from "./components";
import { SectionDivider, Description, ResolvedPathText, ProjectSectionContainer, ProjectSectionLabel, ProjectFieldCollapse, SkipOptionRow, CloudErrorActionRow, ActionLink } from "./styles";
import { ValidateProjectFormErrorField } from "./shims/wi-core";
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
import { DEFAULT_LIBRARY_NAME, DEFAULT_PACKAGE_NAME, DEFAULT_PROJECT_NAME } from "./types";
import { useRealtimeProjectPathValidation } from "./useRealtimeProjectPathValidation";

const FieldGroup = styled.div`
    margin-bottom: 20px;
`;

interface LibraryFormData {
    libraryName: string;
    packageName: string;
    path: string;
    orgName: string;
    version: string;
}

export function LibraryCreationView({ onBack, ballerinaUnavailable }: { onBack?: () => void; ballerinaUnavailable?: boolean }) {
    const { wsClient } = useVisualizerContext();
    const { authState } = useCloudContext();
    const organizations = (authState?.userInfo?.organizations as Array<{ id?: any; handle: string; name: string }> | undefined);
    const isProjectModeSupported = useProjectModeSupported();
    const { path: workspacePath, isReady: workspaceReady } = useWorkspaceRoot();
    const firstFieldRef = useRef<HTMLInputElement>(null);
    const handleTouched = useRef(false);
    const withinProjectNameTouchedRef = useRef(false);
    const orgNameInitialized = useRef(false);
    const defaultPathInitialized = useRef(false);
    const [packageNameTouched, setPackageNameTouched] = useState(false);
    const [withinProjectNameTouched, setWithinProjectNameTouched] = useState(false);
    const [isPackageInfoExpanded, setIsPackageInfoExpanded] = useState(false);
    const [isValidating, setIsValidating] = useState(false);
    const [createWithinProject, setCreateWithinProject] = useState(false);
    const [withinProjectName, setWithinProjectName] = useState(DEFAULT_PROJECT_NAME);
    const [withinProjectHandle, setWithinProjectHandle] = useState(() => sanitizeProjectHandle(DEFAULT_PROJECT_NAME));
    const [libraryNameError, setLibraryNameError] = useState<string | null>(null);
    const [pathError, setPathError] = useState<string | null>(null);
    const [packageNameError, setPackageNameError] = useState<string | null>(null);
    const [orgNameError, setOrgNameError] = useState<string | null>(null);
    const [withinProjectNameError, setWithinProjectNameError] = useState<string | null>(null);
    const [projectHandleError, setProjectHandleError] = useState<string | null>(null);
    const [cloudProjectNameError, setCloudProjectNameError] = useState<string | null>(null);
    const [cloudProjectHandleError, setCloudProjectHandleError] = useState<string | null>(null);
    const [matchedCloudProject, setMatchedCloudProject] = useState<{ project: any; org: any } | null>(null);
    const [defaultPath, setDefaultPath] = useState("");
    const [pathTouched, setPathTouched] = useState(false);
    const [editablePath, setEditablePath] = useState("");
    const [formData, setFormData] = useState<LibraryFormData>({
        libraryName: DEFAULT_LIBRARY_NAME,
        packageName: DEFAULT_PACKAGE_NAME,
        path: "",
        orgName: "",
        version: "",
    });

    const debouncedSetLibraryNameError = useMemo(
        () => debounce((error: string) => setLibraryNameError(error), 300),
        []
    );
    const debouncedSetWithinProjectNameError = useMemo(
        () => debounce((error: string) => setWithinProjectNameError(error), 300),
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
        if (!workspaceReady) return;
        let mounted = true;
        (async () => {
            // Seed the default path only once — this effect re-runs on workspacePath /
            // project-mode changes, and without the guard it would clobber a path the
            // user has since chosen via Browse or by typing.
            if (!defaultPathInitialized.current) {
                const dp = workspacePath || (await wsClient.getDefaultCreationPath()).path;
                if (!mounted) return;
                defaultPathInitialized.current = true;
                setDefaultPath(dp);
                setFormData(prev => ({ ...prev, path: dp }));
            }

            if (isProjectModeSupported) {
                if (!mounted) return;
                setCreateWithinProject(true);
            }
        })();
        return () => {
            mounted = false;
        };
    }, [workspaceReady, wsClient, workspacePath, isProjectModeSupported]);

    // Initialize org name independently of workspace readiness.
    useEffect(() => {
        if (orgNameInitialized.current) return;
        orgNameInitialized.current = true;
        if (organizations && organizations.length > 0) {
            setFormData(prev => ({ ...prev, orgName: organizations[0].handle }));
        } else {
            wsClient.getDefaultOrgName()
                .then(({ orgName }) => setFormData(prev => ({ ...prev, orgName })))
                .catch((error) => console.error("Failed to fetch default org name:", error));
        }
    }, [organizations, wsClient]);

    useEffect(() => {
        const error = validatePackageName(formData.packageName, formData.libraryName);
        setPackageNameError(error);
    }, [formData.packageName, formData.libraryName]);

    useEffect(() => {
        setOrgNameError(validateOrgName(formData.orgName));
    }, [formData.orgName]);

    // Real-time library name validation — clear immediately when valid, debounce new errors
    // to avoid flashing "required" on every keystroke.
    useEffect(() => {
        const error = validateComponentName(formData.libraryName);
        if (!error) {
            debouncedSetLibraryNameError.cancel();
            setLibraryNameError(null);
            return;
        }
        debouncedSetLibraryNameError(error);
        return () => debouncedSetLibraryNameError.cancel();
    }, [formData.libraryName]);

    // Auto-derive handle from withinProjectName unless manually edited
    useEffect(() => {
        if (handleTouched.current) return;
        if (createWithinProject && withinProjectName) {
            const derived = sanitizeProjectHandle(withinProjectName);
            setWithinProjectHandle(derived);
        }
    }, [withinProjectName, createWithinProject]);

    useEffect(() => {
        if (createWithinProject) {
            setProjectHandleError(validateProjectHandle(withinProjectHandle));
        } else {
            setProjectHandleError(null);
        }
    }, [withinProjectHandle, createWithinProject]);

    // Real-time project name validation — clear immediately when valid, debounce new errors.
    useEffect(() => {
        if (!createWithinProject) {
            debouncedSetWithinProjectNameError.cancel();
            setWithinProjectNameError(null);
            return;
        }
        const error = validateProjectName(withinProjectName.trim());
        if (!error) {
            debouncedSetWithinProjectNameError.cancel();
            setWithinProjectNameError(null);
            return;
        }
        debouncedSetWithinProjectNameError(error);
        return () => debouncedSetWithinProjectNameError.cancel();
    }, [withinProjectName, createWithinProject]);

    // Validate project name against cached cloud projects — synchronous, no debounce needed.
    useEffect(() => {
        if (!cloudProjectsData?.projects || !createWithinProject || !withinProjectName?.trim()) {
            setCloudProjectNameError(null);
            setMatchedCloudProject(null);
            return;
        }
        const nameToCheck = withinProjectName.trim().toLowerCase();
        const matched = cloudProjectsData.projects.find((p: any) => p.name.toLowerCase() === nameToCheck);
        if (matched) {
            const suggested = suggestAvailableProjectName(
                withinProjectName.trim(),
                cloudProjectsData.projects.map((p: any) => p.name)
            );
            if (!withinProjectNameTouchedRef.current) {
                // Default name conflicts — silently auto-rename
                setWithinProjectName(suggested);
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
    }, [cloudProjectsData, withinProjectName, createWithinProject]);

    // Validate project handle against cached cloud project handles
    useEffect(() => {
        if (!cloudProjectsData?.projects || !createWithinProject || !withinProjectHandle?.trim()) {
            setCloudProjectHandleError(null);
            return;
        }
        const handleToCheck = withinProjectHandle.trim().toLowerCase();
        const matched = cloudProjectsData.projects.find((p: any) => p.handler.toLowerCase() === handleToCheck);
        if (matched) {
            const suggested = suggestAvailableProjectName(
                withinProjectHandle.trim(),
                cloudProjectsData.projects.map((p: any) => p.handler)
            );
            if (!handleTouched.current) {
                setWithinProjectHandle(suggested);
                setCloudProjectHandleError(null);
            } else {
                setCloudProjectHandleError("A project with this id already exists in cloud");
            }
        } else {
            setCloudProjectHandleError(null);
        }
    }, [cloudProjectsData, withinProjectHandle, createWithinProject]);

    // Focus and select the first field on mount — VSCodeTextField is a web component,
    // so the real <input> is inside its shadow DOM and needs to be targeted directly.
    useEffect(() => {
        setTimeout(() => {
            const inner = (firstFieldRef.current as any)?.shadowRoot?.querySelector("input") as HTMLInputElement | null;
            inner?.focus();
            inner?.select();
        }, 0);
    }, []);

    // Keep editablePath in sync with the committed path when the user is not actively editing
    useEffect(() => {
        if (!pathTouched) {
            setEditablePath(formData.path || defaultPath);
        }
    }, [formData.path, defaultPath, pathTouched]);

    useRealtimeProjectPathValidation({
        wsClient,
        projectPath: editablePath,
        projectName: createWithinProject ? withinProjectHandle : formData.packageName,
        createAsWorkspace: createWithinProject,
        pathTouched,
        requiredPathMessage: "Please select a path for your library",
        invalidPathMessage: "Invalid library path",
        onPathErrorChange: setPathError,
    });

    const computeDisplayedPath = (): string => {
        const base = editablePath;
        if (createWithinProject) {
            const projectPath = withinProjectHandle
                ? joinPath(base, withinProjectHandle)
                : base;
            return formData.packageName ? joinPath(projectPath, formData.packageName) : projectPath;
        }
        return joinPath(base, formData.packageName);
    };

    const resolvedPath = computeDisplayedPath();

    const handleLibraryName = (value: string) => {
        const sanitized = sanitizePackageName(value);
        setFormData(prev => ({
            ...prev,
            libraryName: value,
            packageName: packageNameTouched ? prev.packageName : sanitized,
        }));
        if (!packageNameTouched && !withinProjectNameTouched && !withinProjectName) {
            setWithinProjectName(DEFAULT_PROJECT_NAME);
        }
    };

    const handlePathSelection = async () => {
        const result = await wsClient.selectFileOrDirPath({ startPath: editablePath || formData.path || defaultPath });
        if (!result.path) return;
        setPathTouched(false);
        setEditablePath(result.path);
        setFormData(prev => ({ ...prev, path: result.path }));
    };

    const handleCreateWithinProjectToggle = (checked: boolean) => {
        if (checked) {
            setCreateWithinProject(true);
            if (!withinProjectName) {
                setWithinProjectName(DEFAULT_PROJECT_NAME);
                if (!handleTouched.current) {
                    setWithinProjectHandle(sanitizeProjectHandle(DEFAULT_PROJECT_NAME));
                }
            }
        } else {
            handleTouched.current = false;
            setCreateWithinProject(false);
            setWithinProjectName("");
            setWithinProjectHandle("");
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

        const libraryNameErr = validateComponentName(formData.libraryName);
        if (libraryNameErr) {
            setLibraryNameError(libraryNameErr);
            hasError = true;
        }

        if (formData.packageName.length < 2) {
            setPackageNameError("Package name must be at least 2 characters");
            setIsPackageInfoExpanded(true);
            hasError = true;
        } else {
            const pkgError = validatePackageName(formData.packageName, formData.libraryName);
            if (pkgError) {
                setPackageNameError(pkgError);
                setIsPackageInfoExpanded(true);
                hasError = true;
            }
        }

        if (!currentPath || currentPath.trim().length < 2) {
            setPathError("Please select a path for your library");
            hasError = true;
        }

        if (createWithinProject) {
            const projectNameErr = validateProjectName(withinProjectName.trim());
            if (projectNameErr) {
                setWithinProjectNameError(projectNameErr);
                hasError = true;
            }
        }

        if (createWithinProject) {
            const hErr = validateProjectHandle(withinProjectHandle);
            if (hErr) {
                setProjectHandleError(hErr);
                setIsPackageInfoExpanded(true);
                hasError = true;
            }
        }

        if (cloudProjectNameError) {
            hasError = true;
        }

        if (cloudProjectHandleError) {
            hasError = true;
        }

        if (orgNameError) {
            setIsPackageInfoExpanded(true);
            hasError = true;
        }

        if (hasError) {
            setIsValidating(false);
            return;
        }

        try {
            const validationResult = await wsClient.validateProjectPath({
                projectPath: currentPath,
                projectName: createWithinProject ? withinProjectHandle : formData.packageName,
                createDirectory: true,
                createAsWorkspace: createWithinProject,
            });

            if (!validationResult.isValid) {
                if (validationResult.errorField === ValidateProjectFormErrorField.PATH) {
                    setPathError(validationResult.errorMessage || "Invalid library path");
                } else if (validationResult.errorField === ValidateProjectFormErrorField.NAME) {
                    if (createWithinProject) {
                        setProjectHandleError(validationResult.errorMessage || "Invalid project ID");
                        setIsPackageInfoExpanded(true);
                    } else {
                        setPackageNameError(validationResult.errorMessage || "Invalid package name");
                        setIsPackageInfoExpanded(true);
                    }
                }
                setIsValidating(false);
                return;
            }

            const orgHandle = organizations?.find(o => o.handle === formData.orgName)?.handle ||
                sanitizeOrgHandle(formData.orgName)

            await wsClient.createBIProject({
                projectName: formData.libraryName.trim(),
                packageName: formData.packageName,
                projectPath: currentPath,
                createDirectory: true,
                createAsWorkspace: createWithinProject,
                workspaceName: createWithinProject ? withinProjectName : undefined,
                orgName: formData.orgName || undefined,
                orgHandle: orgHandle,
                version: formData.version || undefined,
                isLibrary: true,
                projectHandle: createWithinProject ? withinProjectHandle : undefined,
            });
        } catch (error) {
            setPathError("An error occurred during validation");
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
                            <BackButton type="button" onClick={() => onBack?.()} title="Go back">
                                <Icon
                                    name="arrow-left"
                                    isCodicon
                                    sx={{ width: "16px", height: "16px", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                                    iconSx={{ color: "var(--vscode-foreground)", fontSize: "16px", lineHeight: 1 }}
                                />
                            </BackButton>
                            <HeaderText>
                                <HeaderTitle variant="h2">Create Library</HeaderTitle>
                                <HeaderSubtitle>
                                    Build reusable components and utilities to share across projects.
                                </HeaderSubtitle>
                            </HeaderText>
                        </HeaderRow>
                    </FormPanelHeader>
                    <FormBody>
                        <FormContent>
                            <FieldGroup>
                                <TextField
                                    ref={firstFieldRef}
                                    onTextChange={handleLibraryName}
                                    value={formData.libraryName}
                                    label="Library Name"
                                    placeholder="Enter a library name"
                                    required={true}
                                    errorMsg={libraryNameError || ""}
                                />
                            </FieldGroup>

                            {/* Project Name - shown by default when project mode is supported */}
                            {isProjectModeSupported && (
                                <ProjectSectionContainer>
                                    <ProjectSectionLabel>Project</ProjectSectionLabel>
                                    <ProjectFieldCollapse isVisible={createWithinProject}>
                                        <TextField
                                            onTextChange={(value) => {
                                                setWithinProjectNameTouched(true);
                                                withinProjectNameTouchedRef.current = true;
                                                setWithinProjectName(value);
                                                if (withinProjectNameError) setWithinProjectNameError(null);
                                            }}
                                            value={withinProjectName}
                                            label="Project Name"
                                            placeholder="Enter project name"
                                            required={true}
                                            errorMsg={withinProjectNameError || cloudProjectNameError || ""}
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
                                            checked={createWithinProject}
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
                                    id="library-folder-selector"
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

                            <SectionDivider />

                            <AdvancedConfigurationSection
                                isExpanded={isPackageInfoExpanded}
                                onToggle={() => setIsPackageInfoExpanded(!isPackageInfoExpanded)}
                                data={{
                                    packageName: formData.packageName,
                                    orgName: formData.orgName,
                                    version: formData.version,
                                    projectHandle: createWithinProject ? withinProjectHandle : undefined,
                                }}
                                onChange={(data) => {
                                    if (data.projectHandle !== undefined) {
                                        handleTouched.current = true;
                                        if (projectHandleError) setProjectHandleError(null);
                                        setWithinProjectHandle(data.projectHandle);
                                        return;
                                    }
                                    if (data.packageName !== undefined) {
                                        setPackageNameTouched(data.packageName.length > 0);
                                        if (packageNameError) setPackageNameError(null);
                                        if (!withinProjectNameTouched && !withinProjectName) {
                                            setWithinProjectName(DEFAULT_PROJECT_NAME);
                                        }
                                    }
                                    setFormData(prev => ({ ...prev, ...data }));
                                }}
                                isLibrary={true}
                                packageNameError={packageNameError}
                                orgNameError={orgNameError}
                                projectHandleError={projectHandleError || cloudProjectHandleError}
                                organizations={organizations}
                                hasError={!!(packageNameError || orgNameError || projectHandleError || cloudProjectHandleError)}
                            />

                            <FormFooter>
                                <span title={ballerinaUnavailable ? "Ballerina distribution is not set up. Use Configure to set it up." : undefined}>
                                    <Button
                                        disabled={isValidating || ballerinaUnavailable || !!libraryNameError || !!withinProjectNameError || !!cloudProjectNameError || !!cloudProjectHandleError || !!packageNameError || !!orgNameError || !!projectHandleError || !!pathError}
                                        onClick={handleCreate}
                                        appearance="primary"
                                    >
                                        {isValidating ? "Validating..." : "Create Library"}
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
