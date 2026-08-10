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
import { Button, DirectorySelector, Icon, TextField } from "@wso2/ui-toolkit";
import styled from "@emotion/styled";
import { useVisualizerContext } from "./context/WsClientContext";
import { useCloudContext, useWorkspaceRoot } from "./providers";
import {
    sanitizePackageName,
    validateComponentName,
    validatePackageName,
    validateOrgName,
    joinPath,
    splitPath,
    extractBase,
    sanitizeOrgHandle,
} from "./utils";
import { AdvancedConfigurationSection } from "./components";
import { SectionDivider } from "./styles";
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
import { DEFAULT_LIBRARY_NAME, DEFAULT_PACKAGE_NAME } from "./types";
import { CreatingIntegrationView } from "../../../CreateIntegrationWizard/components/CreatingIntegrationView";
import { useRealtimeProjectPathValidation } from "./useRealtimeProjectPathValidation";
import { useDirectoryNameCoupling } from "../../hooks/useDirectoryNameCoupling";
import {
    checkNameCollision as resolveNameCollisionMessage,
    resolveDefaultNameAndDirectory,
    toTakenNames,
    emptyTakenNames,
    TakenNames,
} from "../../hooks/resolveAvailableDirectoryName";

const FieldGroup = styled.div`
    margin-bottom: 20px;
`;

const InfoNote = styled.div`
    display: flex;
    align-items: flex-start;
    gap: 6px;
    margin-top: 6px;
    font-size: 12px;
    line-height: 1.4;
    color: var(--vscode-descriptionForeground);
`;

/** Form-level failure (path validation or the create call itself). The path field
 *  used to be the only home for these, and it is hidden in the embedded flow. */
const FormError = styled.div`
    display: flex;
    align-items: flex-start;
    gap: 6px;
    margin-top: 12px;
    font-size: 12px;
    line-height: 1.4;
    color: var(--vscode-errorForeground);
`;


/** Gives the create-in-progress screen room to centre itself inside the scrolling form body. */
const CreatingSlot = styled.div`
    display: flex;
    min-height: 320px;
`;

interface LibraryFormData {
    libraryName: string;
    packageName: string;
    path: string;
    orgName: string;
    version: string;
}

/**
 * The project the library is created into, resolved by the unified Create chooser.
 * In the always-workspace model the library is always a package inside a
 * workspace: `workspacePath` is that workspace's folder, and `isNewProject`
 * decides whether it is scaffolded fresh or the package added into an existing one.
 */
interface LibraryProjectContext {
    isNewProject: boolean;
    workspacePath: string;
    workspaceName?: string;
}

export function LibraryCreationView({ onBack, ballerinaUnavailable, projectContext, embedded }: { onBack?: () => void; ballerinaUnavailable?: boolean; projectContext?: LibraryProjectContext; embedded?: boolean }) {
    const { wsClient } = useVisualizerContext();
    const { authState } = useCloudContext();
    const organizations = (authState?.userInfo?.organizations as Array<{ id?: any; handle: string; name: string }> | undefined);
    const { path: openWorkspacePath, isReady: openWorkspaceReady } = useWorkspaceRoot();
    // When the chooser resolved a project, seed the path from that workspace folder
    // (ready immediately); otherwise fall back to the currently open workspace.
    const workspacePath = projectContext?.workspacePath ?? openWorkspacePath;
    const workspaceReady = projectContext ? true : openWorkspaceReady;
    const firstFieldRef = useRef<HTMLInputElement>(null);
    const orgNameInitialized = useRef(false);
    const defaultPathInitialized = useRef(false);
    const libraryNameTouchedRef = useRef(false);
    // The location `takenNames` currently describes, so the refresh effect below can skip
    // the path the seed already fetched (and re-fetch whenever the user retargets).
    const takenNamesPathRef = useRef<string | null>(null);
    const [packageNameTouched, setPackageNameTouched] = useState(false);
    const dirCoupling = useDirectoryNameCoupling(() => sanitizePackageName(DEFAULT_LIBRARY_NAME), sanitizePackageName);
    const { directoryName, dirTouched } = dirCoupling;
    const [isPackageInfoExpanded, setIsPackageInfoExpanded] = useState(false);
    const [isValidating, setIsValidating] = useState(false);
    // Distinct from `isValidating`: set once the create is actually in flight, at which
    // point the window is about to reload and the form is replaced by a progress screen.
    const [isCreating, setIsCreating] = useState(false);
    const [libraryNameError, setLibraryNameError] = useState<string | null>(null);
    const [pathError, setPathError] = useState<string | null>(null);
    const [existingWorkspace, setExistingWorkspace] = useState(false);
    // Folder names and component titles already used in the target project, so a
    // library name the user types can be flagged live if it collides.
    const [takenNames, setTakenNames] = useState<TakenNames>(emptyTakenNames());
    const [packageNameError, setPackageNameError] = useState<string | null>(null);
    const [orgNameError, setOrgNameError] = useState<string | null>(null);
    const [formError, setFormError] = useState<string | null>(null);
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

    /** Returns a diagnostic when the name collides with an existing integration or
     *  library in the target project (by folder or by title), else null. */
    const checkNameCollision = (value: string): string | null =>
        resolveNameCollisionMessage(value, takenNames, sanitizePackageName);

    useEffect(() => {
        if (!workspaceReady) return;
        let mounted = true;

        (async () => {
            // Seed the default path only once — this effect re-runs on workspacePath
            // changes, and without the guard it would clobber a path the user has since
            // chosen via Browse or by typing.
            if (!defaultPathInitialized.current) {
                const dp = workspacePath || (await wsClient.getDefaultCreationPath()).path;
                if (!mounted) return;
                // Fetch the project's existing folders + titles once: used to pick a
                // collision-free default AND to flag name collisions live.
                let taken = emptyTakenNames();
                try {
                    taken = toTakenNames(await wsClient.getProjectComponentNames({ projectPath: dp }));
                    if (!mounted) return;
                } catch {
                    // Best effort — fall back to the un-indexed default on failure.
                }
                takenNamesPathRef.current = dp;
                setTakenNames(taken);
                // Resolve the indexed default name/folder BEFORE committing the path so
                // the fields show the final values immediately (like the wizard).
                const { name, directoryName: dirName } = resolveDefaultNameAndDirectory(DEFAULT_LIBRARY_NAME, taken, sanitizePackageName);
                defaultPathInitialized.current = true;
                // Don't clobber a name the user typed while the seed was resolving.
                if (!libraryNameTouchedRef.current) {
                    dirCoupling.setDirectoryName(dirName);
                    setFormData(prev => ({ ...prev, libraryName: name, packageName: sanitizePackageName(name), path: dp }));
                } else {
                    setFormData(prev => ({ ...prev, path: dp }));
                }
                setDefaultPath(dp);
            }
        })();
        return () => {
            mounted = false;
        };
    }, [workspaceReady, wsClient, workspacePath]);

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
    // to avoid flashing "required" on every keystroke. Also flags a name that collides
    // with an existing integration/library (by folder or title) in the target project.
    useEffect(() => {
        const error = validateComponentName(formData.libraryName) || checkNameCollision(formData.libraryName);
        if (!error) {
            debouncedSetLibraryNameError.cancel();
            setLibraryNameError(null);
            return;
        }
        debouncedSetLibraryNameError(error);
        return () => debouncedSetLibraryNameError.cancel();
    }, [formData.libraryName, takenNames]);

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

    // The collision list describes one location, but Browse / editing the path can retarget
    // it (standalone variant only — the embedded flow hides the path field). Without this the
    // snapshot stays pinned to the seeded folder, so a name that is free in the newly chosen
    // project keeps being rejected. Keyed on `editablePath` (the base dir the path validation
    // hook also watches) and debounced to match it; the name-validation effect above already
    // depends on `takenNames`, so the diagnostic self-corrects once this lands.
    useEffect(() => {
        const targetPath = editablePath.trim();
        if (!targetPath || targetPath === takenNamesPathRef.current) {
            return;
        }
        let cancelled = false;
        const timer = setTimeout(async () => {
            let taken = emptyTakenNames();
            try {
                taken = toTakenNames(await wsClient.getProjectComponentNames({ projectPath: targetPath }));
            } catch {
                // Fail open: an empty list only defers collision reporting to submit-time
                // validation, whereas keeping the previous location's list would block
                // names that are actually free here.
            }
            if (cancelled) {
                return;
            }
            takenNamesPathRef.current = targetPath;
            setTakenNames(taken);
        }, 300);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [wsClient, editablePath]);

    useRealtimeProjectPathValidation({
        wsClient,
        projectPath: editablePath,
        projectName: formData.packageName,
        directoryName,
        createAsWorkspace: false,
        allowExistingDirectory: true,
        pathTouched,
        requiredPathMessage: "Please select a path for your library",
        invalidPathMessage: "Invalid library path",
        onPathErrorChange: setPathError,
        onExistingWorkspaceChange: setExistingWorkspace,
    });

    const resolvedPath = joinPath(editablePath, directoryName);

    /**
     * The unified Create flow picks the project — and therefore the location — on its
     * chooser screen, so the library form asks only for a name and creates the package
     * inside `projectContext.workspacePath`. This mirrors the integration wizard, which
     * hides its own path field when embedded. The standalone `library` variant has no
     * chooser in front of it, so it keeps owning its location.
     */
    const hidePath = !!embedded;

    const handleLibraryName = (value: string) => {
        libraryNameTouchedRef.current = true;
        const sanitized = sanitizePackageName(value);
        setFormData(prev => ({
            ...prev,
            libraryName: value,
            packageName: packageNameTouched ? prev.packageName : sanitized,
        }));
        // Reflect the derived folder immediately for a responsive path field. Only the
        // default name is auto-indexed (at seed time); a name the user types is used
        // verbatim, matching the integration wizard. Unlike the other Create-flow
        // forms, a blank name is sanitized as-is rather than clearing the folder.
        dirCoupling.handleDisplayNameChange(value, { guardBlank: false });
    };

    const handlePathSelection = async () => {
        const result = await wsClient.selectFileOrDirPath({ startPath: editablePath || formData.path || defaultPath });
        if (!result.path) return;
        setPathTouched(false);
        setEditablePath(result.path);
        setFormData(prev => ({ ...prev, path: result.path }));
    };

    const handleCreate = async () => {
        setIsValidating(true);
        setFormError(null);

        // Commit any un-blurred path before submitting
        const currentPath = editablePath || formData.path;
        if (pathTouched && editablePath !== formData.path) {
            setFormData(prev => ({ ...prev, path: editablePath }));
        }

        let hasError = false;

        const libraryNameErr = validateComponentName(formData.libraryName) || checkNameCollision(formData.libraryName);
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
            // With the path field hidden the location comes from the chooser, so an
            // unusable one is a flow-level problem rather than a field the user can fix.
            if (hidePath) {
                setFormError("The project location could not be resolved. Go back and select the project again.");
            } else {
                setPathError("Please select a path for your library");
            }
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
            // The chooser already resolved and validated the project location in the
            // unified Create flow (as the integration wizard also trusts), so only the
            // standalone form re-validates the path it collected here.
            if (!hidePath) {
                const validationResult = await wsClient.validateProjectPath({
                    projectPath: currentPath,
                    projectName: formData.packageName,
                    directoryName,
                    createDirectory: true,
                    createAsWorkspace: false,
                    allowExistingDirectory: true,
                });

                if (!validationResult.isValid) {
                    if (validationResult.errorField === ValidateProjectFormErrorField.PATH) {
                        setPathError(validationResult.errorMessage || "Invalid library path");
                    } else if (validationResult.errorField === ValidateProjectFormErrorField.NAME) {
                        setPackageNameError(validationResult.errorMessage || "Invalid package name");
                        setIsPackageInfoExpanded(true);
                    }
                    setIsValidating(false);
                    return;
                }
            }

            const orgHandle = organizations?.find(o => o.handle === formData.orgName)?.handle ||
                sanitizeOrgHandle(formData.orgName)

            // The extension reloads the window from here on, so the form is replaced by
            // the progress screen the reloaded window then continues.
            setIsCreating(true);
            await wsClient.createBIProject({
                projectName: formData.libraryName.trim(),
                packageName: formData.packageName,
                projectPath: currentPath,
                directoryName,
                createDirectory: true,
                createAsWorkspace: false,
                orgName: formData.orgName || undefined,
                orgHandle: orgHandle,
                version: formData.version || undefined,
                isLibrary: true,
                newProject: projectContext?.isNewProject,
                workspaceName: projectContext?.workspaceName,
            });
        } catch (error) {
            console.error("Failed to create the library:", error);
            setIsCreating(false);
            setFormError(error instanceof Error ? error.message : "Failed to create the library");
        } finally {
            setIsValidating(false);
        }
    };

    const content = isCreating ? (
        <CreatingSlot>
            <CreatingIntegrationView
                variant="create"
                componentLabel="library"
                integrationName={formData.libraryName.trim() || DEFAULT_LIBRARY_NAME}
                projectName={projectContext?.workspaceName}
                isNewProject={projectContext?.isNewProject}
            />
        </CreatingSlot>
    ) : (
        <>
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

                            {!hidePath && (
                            <FieldGroup>
                                <DirectorySelector
                                    id="library-folder-selector"
                                    label="Select Path"
                                    placeholder="Browse to select a folder..."
                                    selectedPath={resolvedPath}
                                    required={true}
                                    onSelect={handlePathSelection}
                                    onChange={(value) => {
                                        // The field shows the full target path; its last
                                        // segment is the on-disk folder name (editable and
                                        // decoupled from the package name). Editing it takes
                                        // manual control of the folder so auto-indexing stops.
                                        const { name } = splitPath(value);
                                        const base = extractBase(value, name);
                                        setPathTouched(true);
                                        setEditablePath(base);
                                        dirCoupling.setDirectoryName(name);
                                        dirCoupling.setDirTouched(true);
                                    }}
                                    onBlur={() => {
                                        if (pathTouched && editablePath !== formData.path) {
                                            setFormData(prev => ({ ...prev, path: editablePath }));
                                        }
                                    }}
                                    errorMsg={pathError || undefined}
                                />
                                {existingWorkspace && !pathError && (
                                    <InfoNote>
                                        <Icon name="info" isCodicon sx={{ marginTop: "1px" }} />
                                        <span>This is an integrator project. Your new library will be added to it.</span>
                                    </InfoNote>
                                )}
                            </FieldGroup>
                            )}

                            <SectionDivider />

                            <AdvancedConfigurationSection
                                isExpanded={isPackageInfoExpanded}
                                onToggle={() => setIsPackageInfoExpanded(!isPackageInfoExpanded)}
                                data={{
                                    packageName: formData.packageName,
                                    orgName: formData.orgName,
                                    version: formData.version,
                                }}
                                onChange={(data) => {
                                    if (data.packageName !== undefined) {
                                        setPackageNameTouched(data.packageName.length > 0);
                                        if (packageNameError) setPackageNameError(null);
                                    }
                                    setFormData(prev => ({ ...prev, ...data }));
                                }}
                                isLibrary={true}
                                packageNameError={packageNameError}
                                orgNameError={orgNameError}
                                organizations={organizations}
                                hasError={!!(packageNameError || orgNameError)}
                            />

                            {formError && (
                                <FormError>
                                    <Icon name="error" isCodicon sx={{ marginTop: "1px" }} />
                                    <span>{formError}</span>
                                </FormError>
                            )}

                            <FormFooter>
                                <span title={ballerinaUnavailable ? "Ballerina distribution is not set up. Use Configure to set it up." : undefined}>
                                    <Button
                                        disabled={isValidating || ballerinaUnavailable || !!libraryNameError || !!packageNameError || !!orgNameError || (!hidePath && !!pathError)}
                                        onClick={handleCreate}
                                        appearance="primary"
                                    >
                                        {isValidating ? "Validating..." : "Create Library"}
                                    </Button>
                                </span>
                            </FormFooter>
        </>
    );

    // Embedded in the unified Create shell: render content only; the shell owns the
    // backdrop, panel, header, and scrolling body.
    if (embedded) {
        return content;
    }

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
                        <FormContent>{content}</FormContent>
                    </FormBody>
                </FormPanel>
            </PageContainer>
        </PageBackdrop>
    );
}
