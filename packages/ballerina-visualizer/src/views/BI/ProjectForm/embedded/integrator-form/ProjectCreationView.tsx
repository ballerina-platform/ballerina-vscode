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

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import debounce from "lodash/debounce";
import { Button, DirectorySelector, Icon, TextField } from "@wso2/ui-toolkit";
import { useVisualizerContext } from "./context/WsClientContext";
import {
    joinPath,
    splitPath,
    sanitizePackageName,
    validateProjectName,
} from "./utils";
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
import { FieldGroup } from "./styles";
import { DEFAULT_PROJECT_NAME } from "./types";
import { useDirectoryNameCoupling } from "../../hooks/useDirectoryNameCoupling";
import { resolveDefaultNameAndDirectory, toTakenNames, emptyTakenNames } from "../../hooks/resolveAvailableDirectoryName";

export function ProjectCreationView({ onBack, ballerinaUnavailable }: { onBack?: () => void; ballerinaUnavailable?: boolean }) {
    const { wsClient } = useVisualizerContext();
    const firstFieldRef = useRef<HTMLInputElement>(null);
    const defaultPathInitialized = useRef(false);
    // True once the user has typed in the name field — stops the one-time seed from
    // overwriting a name the user entered before the async seed resolved.
    const projectNameTouchedRef = useRef(false);
    const [isValidating, setIsValidating] = useState(false);
    const [projectNameError, setProjectNameError] = useState<string | null>(null);
    const [pathError, setPathError] = useState<string | null>(null);
    const [defaultPath, setDefaultPath] = useState("");
    const [pathTouched, setPathTouched] = useState(false);
    const [editablePath, setEditablePath] = useState("");
    const [projectName, setProjectName] = useState(DEFAULT_PROJECT_NAME);
    // The on-disk folder name. Defaults to a name-derived value and stays in sync with
    // the project name until the user edits the path's last segment (dirTouched), after
    // which it is left under manual control.
    const dirCoupling = useDirectoryNameCoupling(() => sanitizePackageName(DEFAULT_PROJECT_NAME), sanitizePackageName);
    const { directoryName, dirTouched } = dirCoupling;

    const debouncedSetProjectNameError = useMemo(
        () => debounce((error: string) => setProjectNameError(error), 300),
        []
    );

    // The name-derived default for the directory segment (empty until a name is typed).
    const autoDirectoryName = projectName.trim() ? sanitizePackageName(projectName) : "";
    // The folder segment actually used: the manually edited value when the user has
    // taken control, otherwise the name-derived default.
    const effectiveDirectoryName = dirTouched ? directoryName.trim() : (directoryName.trim() || autoDirectoryName);

    // Seed the default path once. Prefer the open workspace folder, falling back to the
    // default creation directory. The indexed default directory name is resolved here —
    // BEFORE the path and name are committed — so the path field shows the final value
    // immediately (like the wizard) rather than flashing the un-indexed "default" and an
    // "already exists" diagnostic while a reactive re-index catches up. The candidate is
    // resolved locally against a single upfront folder listing (matching the integration
    // wizard / library form) rather than probing `validateProjectPath` once per candidate.
    useEffect(() => {
        let mounted = true;

        (async () => {
            if (defaultPathInitialized.current) return;
            try {
                const { path: workspacePath } = await wsClient.getWorkspaceRoot();
                if (!mounted) return;
                const dp = workspacePath || (await wsClient.getDefaultCreationPath()).path;
                if (!mounted) return;
                let taken = emptyTakenNames();
                try {
                    taken = toTakenNames(await wsClient.getProjectComponentNames({ projectPath: dp }));
                } catch {
                    // Best effort — fall back to the un-indexed default on failure.
                }
                if (!mounted) return;
                const { directoryName: dirName } = resolveDefaultNameAndDirectory(DEFAULT_PROJECT_NAME, taken, sanitizePackageName);
                defaultPathInitialized.current = true;
                // Set the resolved directory name BEFORE the path becomes non-empty so no
                // render ever pairs a real path with the un-indexed default name (which is
                // what triggers the realtime "already exists" diagnostic flash).
                // Don't clobber a name the user typed while the seed was resolving.
                if (!projectNameTouchedRef.current) {
                    dirCoupling.setDirectoryName(dirName);
                }
                setDefaultPath(dp);
                setEditablePath(dp);
            } catch (error) {
                console.error("Failed to fetch default path:", error);
            }
        })();
        return () => { mounted = false; };
    }, [wsClient]);

    // Focus and select the first field on mount — VSCodeTextField is a web component,
    // so the real <input> is inside its shadow DOM and needs to be targeted directly.
    useEffect(() => {
        setTimeout(() => {
            const inner = (firstFieldRef.current as any)?.shadowRoot?.querySelector("input") as HTMLInputElement | null;
            inner?.focus();
            inner?.select();
        }, 0);
    }, []);

    // Real-time project name validation — clear immediately when valid, debounce errors
    // to avoid flashing "required" on every keystroke before the user finishes typing.
    useEffect(() => {
        const error = validateProjectName(projectName);
        if (!error) {
            debouncedSetProjectNameError.cancel();
            setProjectNameError(null);
            return;
        }
        debouncedSetProjectNameError(error);
        return () => debouncedSetProjectNameError.cancel();
    }, [projectName]);

    useRealtimeProjectPathValidation({
        wsClient,
        projectPath: editablePath,
        projectName,
        createAsWorkspace: true,
        // Validate as soon as there is a real target — once the path is seeded and a
        // directory segment is present — so a "Ballerina project already exists"
        // conflict surfaces live under the path field.
        pathTouched: pathTouched || (editablePath.trim().length > 0 && effectiveDirectoryName.length > 0),
        requiredPathMessage: "Please select a path for your project",
        invalidPathMessage: "Invalid project path",
        onPathErrorChange: useCallback((error: string | null) => setPathError(error), []),
        directoryName: effectiveDirectoryName,
        // The path field is the exact project root — allow creating into an existing
        // (empty or non-Ballerina) directory instead of forcing a brand-new folder.
        allowExistingDirectory: true,
    });

    const resolvedPath = editablePath ? joinPath(editablePath, effectiveDirectoryName) : "";

    const handleNameChange = (value: string) => {
        projectNameTouchedRef.current = true;
        setProjectName(value);
        // Keep the directory name in sync with the project name until the user edits it.
        // (Only the default name is auto-indexed, at seed time — a name the user types is
        // used verbatim, matching the integration wizard.)
        dirCoupling.handleDisplayNameChange(value);
    };

    const handlePathChange = (value: string) => {
        // The field shows the full target path; its last segment is the directory name
        // (editable). Editing it away from the name-derived default takes manual control.
        const { base, name } = splitPath(value);
        setPathTouched(true);
        setEditablePath(base);
        dirCoupling.handleDirectoryNameEdit(name, autoDirectoryName);
    };

    const handlePathSelection = async () => {
        try {
            const result = await wsClient.selectFileOrDirPath({ startPath: editablePath || defaultPath });
            if (!result.path) return;
            setPathTouched(true);
            setEditablePath(result.path);
        } catch (error) {
            console.error("Failed to select path:", error);
            setPathError("Failed to select path. Please try again.");
        }
    };

    const handleCreate = async () => {
        setIsValidating(true);

        const currentPath = editablePath || defaultPath;
        let hasError = false;

        const nameError = validateProjectName(projectName);
        if (nameError) {
            setProjectNameError(nameError);
            hasError = true;
        }

        if (!currentPath || currentPath.trim().length < 2) {
            setPathError("Please select a path for your project");
            hasError = true;
        }

        if (!effectiveDirectoryName) {
            setPathError("Please provide a directory name for your project");
            hasError = true;
        }

        if (hasError) {
            setIsValidating(false);
            return;
        }

        try {
            const validationResult = await wsClient.validateProjectPath({
                projectPath: currentPath,
                projectName,
                createDirectory: true,
                createAsWorkspace: true,
                directoryName: effectiveDirectoryName,
                allowExistingDirectory: true,
            });

            if (!validationResult.isValid) {
                if (validationResult.errorField === ValidateProjectFormErrorField.NAME) {
                    setProjectNameError(validationResult.errorMessage || "Invalid project name");
                } else {
                    setPathError(validationResult.errorMessage || "Invalid project path");
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
            await wsClient.createBIProject({
                workspaceName: projectName,
                projectPath: currentPath,
                createDirectory: true,
                createAsWorkspace: true,
                directoryName: effectiveDirectoryName,
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
                                    onTextChange={handleNameChange}
                                    value={projectName}
                                    label="Project Name"
                                    placeholder="Enter a project name"
                                    required={true}
                                    errorMsg={projectNameError || ""}
                                />
                            </FieldGroup>

                            <FieldGroup>
                                <DirectorySelector
                                    id="project-folder-selector"
                                    label="Select Path"
                                    placeholder="Browse to select a folder..."
                                    selectedPath={resolvedPath}
                                    required={true}
                                    onSelect={handlePathSelection}
                                    onChange={handlePathChange}
                                    errorMsg={pathError || undefined}
                                />
                            </FieldGroup>

                            <FormFooter>
                                <span title={ballerinaUnavailable ? "Ballerina distribution is not set up. Use Configure to set it up." : undefined}>
                                    <Button
                                        disabled={isValidating || ballerinaUnavailable || !!projectNameError || !!pathError}
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
