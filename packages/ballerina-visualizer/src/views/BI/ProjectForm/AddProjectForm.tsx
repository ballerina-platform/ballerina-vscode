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

import { useCallback, useEffect, useMemo, useState } from "react";
import styled from "@emotion/styled";
import { Button, ProgressRing, ThemeColors, Typography } from "@wso2/ui-toolkit";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { AddProjectFormFields } from "./AddProjectFormFields";
import { AddComponentFields } from "./AddComponentFields";
import { AddProjectFormData } from "./types";
import { isFormValidAddProject, joinPath, sanitizeOrgHandle, sanitizePackageName, splitPath } from "./utils";
import { useRealtimeProjectPathValidation } from "../CreateIntegrationWizard/hooks/useRealtimeProjectPathValidation";
import { ValidateProjectFormErrorField } from "@wso2/ballerina-core";
import { BiWsClientProvider } from "../wsManager/WsClientContext";
import { CreateFlowShell } from "./embedded/integrator-form/shared/CreateFlowShell";
import { FormFooter } from "./embedded/integrator-form/shared/FormPageLayout";
import { FormSection } from "./styles";
import { useDirectoryNameCoupling } from "./hooks/useDirectoryNameCoupling";
import { useDefaultOrgName } from "./hooks/useDefaultOrgName";

/**
 * Which screen of the Add-to-project flow is showing. The integration route has no screen
 * of its own: the three-step Create Integration wizard (Name → Type → Configure) is
 * bypassed, and the chooser collects the integration name inline and adds an empty
 * integration directly — matching the welcome-view Create flow, which skips it the same
 * way. Restore an `"integration"` screen mounting `CreateIntegrationWizard` to bring the
 * wizard back here.
 */
type Screen = "chooser" | "library";

/** Holds the panel's body height while initialization settles, so it does not collapse. */
const ShellLoader = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 320px;
`;

/** Submit-time error beside the action button, for failures with no single field. */
const SubmitError = styled.div`
    flex: 1;
    margin-right: 16px;
    font-size: 12px;
    line-height: 1.4;
    color: var(--vscode-errorForeground);
`;

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
    // Folder of the open integration; reserved in the convert flow, where it is moved
    // into the new project.
    const [currentIntegrationDirName, setCurrentIntegrationDirName] = useState<string>("");
    const [addNewAfterConvert, setAddNewAfterConvert] = useState<boolean>(false);
    // chooser = project + starting point, and the integration's name when that is the
    // starting point; library = name + package details.
    const [screen, setScreen] = useState<Screen>("chooser");
    const [targetPath, setTargetPath] = useState<string>("");
    // Whether initialization — workspace discovery and the suggested defaults — has settled.
    // Gates two things. The body is not rendered until then, because `isInProject` defaults
    // to the convert variant and would otherwise flash the wrong screen. And the integration
    // name field, which mounts with this screen rather than on a later one like the library's,
    // must not index its collision-free default against the arriving defaults, or whichever
    // resolves last wins.
    const [defaultsReady, setDefaultsReady] = useState<boolean>(false);
    // Convert flow: `convertBaseDir` is the parent location; the folder name defaults to
    // the project name until edited.
    const [convertBaseDir, setConvertBaseDir] = useState<string>("");
    const convertDirCoupling = useDirectoryNameCoupling("", sanitizePackageName);
    const [convertPathError, setConvertPathError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [pathValidationError, setPathValidationError] = useState<string | null>(null);
    const [packageNameValidationError, setPackageNameValidationError] = useState<string | null>(null);
    const [projectNameValidationError, setProjectNameValidationError] = useState<string | null>(null);
    const resourceTypeLabel = formData.isLibrary ? "Library" : "Integration";
    const isConvert = !isInProject;
    const isConvertAndAdd = isConvert && addNewAfterConvert;
    // Whether a starting point (integration/library) is being added (vs a plain convert).
    const isAddingComponent = isInProject || addNewAfterConvert;
    // An integration is named on this screen and submits from here, like the welcome-view
    // Create flow. Only the library still has a screen of its own behind "Next"; a plain
    // convert has nothing further to collect and also submits from here.
    const isAddingIntegration = isAddingComponent && !formData.isLibrary;
    const routeToNextScreen = isAddingComponent && formData.isLibrary;

    // The name-derived default for the destination folder segment.
    const autoConvertDirName = formData.projectHandle?.trim()
        ? formData.projectHandle
        : sanitizePackageName(formData.workspaceName || "");
    // The folder segment actually used: the manually edited value once the user has
    // taken control, otherwise the name-derived default.
    const effectiveConvertDirName = convertDirCoupling.dirTouched
        ? convertDirCoupling.directoryName.trim()
        : autoConvertDirName;
    const convertFullPath = joinPath(convertBaseDir, effectiveConvertDirName);

    const handleFormDataChange = useCallback((data: Partial<AddProjectFormData>) => {
        setFormData(prev => ({ ...prev, ...data }));
        setPathValidationError(null);
        setPackageNameValidationError(null);
        setProjectNameValidationError(null);
        setComponentNameValidationError(null);
        // Switching starting point swaps which field owns the name, and the outgoing one
        // unmounts without reporting. Clear so a stale diagnostic cannot block the other's
        // submit; whichever field mounts next reports its own on the first render.
        if (data.isLibrary !== undefined) {
            setComponentNameError(null);
        }
    }, []);

    // Owned here: a plain convert never reaches the library screen but still writes the
    // org into the new project's context file.
    const handleOrgResolved = useCallback((orgName: string) => setFormData(prev => ({ ...prev, orgName })), []);
    const { organizations, isOrgLocked, isOrgDataLoaded, markOrgTouched } =
        useDefaultOrgName(isInProject, handleOrgResolved);

    // Owned here so a manually edited package name survives a remount of the library screen.
    const [packageNameTouched, setPackageNameTouched] = useState<boolean>(false);
    const markPackageNameTouched = useCallback(() => setPackageNameTouched(true), []);

    // Same reasoning for the display name: once typed, remounting the library screen
    // must not let the collision-indexed default silently rename it.
    const [nameTouched, setNameTouched] = useState<boolean>(false);
    const markNameTouched = useCallback(() => setNameTouched(true), []);

    // Live name diagnostic from whichever field owns the starting point's name (format +
    // collision with an existing integration/library in the target project). Blocks submit.
    const [componentNameError, setComponentNameError] = useState<string | null>(null);
    // Submit-time name rejection for the integration route, which has no package field to
    // hang it off. Cleared on the next edit by `handleFormDataChange`.
    const [componentNameValidationError, setComponentNameValidationError] = useState<string | null>(null);

    // Adapter so the shared realtime path-validation hook can call the native RPC client.
    const pathValidationClient = useMemo(
        () => ({ validateProjectPath: (p: any) => rpcClient.getBIDiagramRpcClient().validateProjectPath(p) }),
        [rpcClient]
    );

    useRealtimeProjectPathValidation({
        wsClient: pathValidationClient,
        projectPath: convertBaseDir,
        projectName: formData.workspaceName || "",
        createAsWorkspace: true,
        // Only meaningful in the convert flow; validate live once a base and a folder
        // name are present so a "directory already exists" conflict surfaces early.
        pathTouched: isConvert && convertBaseDir.trim().length > 0 && effectiveConvertDirName.length > 0,
        requiredPathMessage: "Please select a location for your project",
        invalidPathMessage: "Invalid project path",
        onPathErrorChange: useCallback((error: string | null) => setConvertPathError(error), []),
        directoryName: effectiveConvertDirName,
    });

    useEffect(() => {
        // One `finally` around the whole sequence, not just the defaults call: the
        // integration name field waits on `defaultsReady` before indexing its default, so
        // any leg failing — workspace discovery included — would strand it unseeded.
        (async () => {
            try {
                const [workspaceRoot, workspaceType] = await Promise.all([
                    rpcClient.getCommonRpcClient().getWorkspaceRoot(),
                    rpcClient.getCommonRpcClient().getWorkspaceType()
                ]);
                const inProject = workspaceType.type === "BALLERINA_WORKSPACE";
                setTargetPath(workspaceRoot.path);
                // The converted project is created next to the current integration by
                // default, so seed the location with the integration's parent directory.
                const { base, name } = splitPath(workspaceRoot.path);
                setConvertBaseDir(base);
                setCurrentIntegrationDirName(inProject ? "" : name);
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
            } catch (error) {
                // Discovery failed: the form stays on its initial state rather than
                // silently pointing at nothing.
                console.error("Failed to resolve the workspace for the add-to-project form:", error);
            } finally {
                setDefaultsReady(true);
            }
        })();
    }, []);

    const handleConvertPathChange = (value: string) => {
        // Last segment is the project folder; editing it away from the derived default
        // takes manual control.
        const { base, name } = splitPath(value);
        setConvertBaseDir(base);
        convertDirCoupling.handleDirectoryNameEdit(name, autoConvertDirName);
        setConvertPathError(null);
    };

    const handleConvertPathSelect = async () => {
        try {
            const selected = await rpcClient.getCommonRpcClient().selectFileOrDirPath({});
            if (selected?.path) {
                setConvertBaseDir(selected.path);
                setConvertPathError(null);
            }
        } catch (error) {
            console.error("Failed to select path:", error);
            setConvertPathError("Failed to select path. Please try again.");
        }
    };

    // The project the starting point is added into: the open workspace, or a new one from
    // converting the current integration.
    const componentTargetPath = isInProject ? targetPath : convertFullPath;

    // Convert-flow "Next" is disabled until the project name + a valid location are set;
    // the add-from-workspace flow has no project fields, so it is always enabled.
    const nextDisabled =
        isLoading ||
        (isConvert &&
            (!formData.workspaceName?.trim() ||
                !convertBaseDir.trim() ||
                !effectiveConvertDirName ||
                !!convertPathError ||
                !!projectNameValidationError));

    /** Chooser → the library form. In the convert flow the project name + location are
     *  captured (and validated) here first; the library screen then owns naming and
     *  configuring it, and the convert-and-add on submit. The integration route has no
     *  next screen — it is named on the chooser and submits from there. */
    const handleNext = () => {
        if (isConvert) {
            if (!formData.workspaceName?.trim()) {
                setProjectNameValidationError("Project name is required");
                return;
            }
            if (!convertBaseDir.trim() || !effectiveConvertDirName) {
                setConvertPathError("Please select a location for your project");
                return;
            }
            if (convertPathError) {
                return;
            }
        }
        setScreen("library");
    };

    const handleAddProject = async () => {
        setIsLoading(true);
        setPathValidationError(null);
        setConvertPathError(null);
        setPackageNameValidationError(null);
        setProjectNameValidationError(null);

        // For convert, the destination is the user-chosen location + folder name.
        const basePathForRequest = isInProject ? targetPath : convertBaseDir;

        if (!isInProject && (!basePathForRequest?.trim() || !effectiveConvertDirName)) {
            setConvertPathError("Please select a location for your project");
            setIsLoading(false);
            return;
        }

        // Adding validates the new package's folder; converting validates the PROJECT folder
        // (nothing inside a brand-new project can collide).
        const packageDirectoryName = formData.packageDirectoryName?.trim() || sanitizePackageName(formData.packageName);

        try {
            const validationResult = await rpcClient.getBIDiagramRpcClient().validateProjectPath({
                projectPath: basePathForRequest,
                projectName: isInProject ? formData.packageName : formData.workspaceName,
                createDirectory: true,
                createAsWorkspace: !isInProject,
                directoryName: isInProject ? packageDirectoryName : effectiveConvertDirName,
            });

            if (!validationResult.isValid) {
                // Convert-flow fields live on the chooser, so those errors return there.
                if (validationResult.errorField === ValidateProjectFormErrorField.PATH) {
                    if (isInProject) {
                        // The path is `<project>/<packageName>`, so this is almost always a
                        // name collision — show it on the library screen.
                        setPathValidationError(validationResult.errorMessage || `Invalid ${resourceTypeLabel.toLowerCase()} path`);
                    } else {
                        setConvertPathError(validationResult.errorMessage || "Invalid project path");
                        setScreen("chooser");
                    }
                } else if (validationResult.errorField === ValidateProjectFormErrorField.NAME) {
                    if (isInProject) {
                        // The library screen edits the package name under Advanced
                        // Configurations, which is where its submit came from. The
                        // integration route has no package field — its name is the only
                        // thing that produced this, so report it there.
                        const message =
                            validationResult.errorMessage || `Invalid ${resourceTypeLabel.toLowerCase()} name`;
                        if (formData.isLibrary) {
                            setPackageNameValidationError(message);
                        } else {
                            setComponentNameValidationError(message);
                        }
                    } else {
                        setProjectNameValidationError(
                            validationResult.errorMessage || "Invalid project name"
                        );
                        setScreen("chooser");
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
                convertToWorkspace: isConvert,
                addNewAfterConvert: isConvertAndAdd,
                path: basePathForRequest,
                directoryName: isInProject ? undefined : effectiveConvertDirName,
                packageDirectoryName,
                workspaceName: formData.workspaceName,
                orgName: formData.orgName || undefined,
                // Omitted rather than sent empty. `createBIProjectPure` writes
                // `org = "${orgHandle ?? finalOrgName}"`, and `??` does not fall through on
                // "" — an empty handle would land in Ballerina.toml verbatim. Only reachable
                // now that the integration route no longer gates submit on the organization.
                orgHandle: orgHandle || undefined,
                version: formData.version || undefined,
                isLibrary: formData.isLibrary,
                projectHandle: formData.projectHandle,
            }).catch((): undefined => undefined);
        } catch (error) {
            const message = error instanceof Error ? error.message : "An error occurred during validation";
            if (isInProject) {
                setPathValidationError(message);
            } else {
                setConvertPathError(message);
                // The Project Location field this reports on lives on the chooser.
                setScreen("chooser");
            }
            setIsLoading(false);
        }
    };

    const goBack = () => {
        rpcClient.getVisualizerRpcClient().goBack();
    };

    const startingPointSubtitle = isInProject
        ? undefined
        : `In project ${formData.workspaceName?.trim() || "your new project"}`;

    // `isInProject` is false until workspace discovery resolves, and false is the convert
    // variant — so rendering straight away shows "Convert to Project" with the project
    // name/location fields for a frame or two, then swaps the title, the fields, the type
    // selector and the button all at once when the real answer lands. Hold the body until
    // it is known. The shell stays mounted, so the backdrop, panel and header row keep
    // their place and only the content fills in.
    if (!defaultsReady) {
        return (
            <CreateFlowShell title="" onBack={goBack} fill>
                <ShellLoader>
                    <ProgressRing color={ThemeColors.PRIMARY} />
                </ShellLoader>
            </CreateFlowShell>
        );
    }

    if (screen === "library") {
        return (
            <CreateFlowShell
                title="New Library"
                subtitle={startingPointSubtitle}
                onBack={() => setScreen("chooser")}
                fill
            >
                {/* The project listing used for the name-collision check is only
                    exposed on the WS bridge, the same seam the integration name field
                    on the chooser uses. */}
                <BiWsClientProvider onBack={() => setScreen("chooser")}>
                    <AddComponentFields
                        formData={formData}
                        onFormDataChange={handleFormDataChange}
                        projectPath={componentTargetPath}
                        reservedFolders={currentIntegrationDirName ? [currentIntegrationDirName] : undefined}
                        organizations={organizations}
                        isOrgLocked={isOrgLocked}
                        isOrgDataLoaded={isOrgDataLoaded}
                        onOrgTouched={markOrgTouched}
                        packageNameTouched={packageNameTouched}
                        onPackageNameTouched={markPackageNameTouched}
                        nameTouched={nameTouched}
                        onNameTouched={markNameTouched}
                        packageNameValidationError={packageNameValidationError || undefined}
                        onNameErrorChange={setComponentNameError}
                    />
                </BiWsClientProvider>

                <FormFooter>
                    {pathValidationError && <SubmitError>{pathValidationError}</SubmitError>}
                    <Button
                        disabled={
                            !!componentNameError ||
                            !isFormValidAddProject(formData, isInProject, addNewAfterConvert) ||
                            isLoading ||
                            (isConvert && !!convertPathError)
                        }
                        onClick={handleAddProject}
                        appearance="primary"
                    >
                        {isLoading ? (
                            <Typography variant="progress">
                                {isConvertAndAdd ? "Converting & Adding..." : "Adding..."}
                            </Typography>
                        ) : (
                            isConvertAndAdd ? "Convert & Add Library" : "Add Library"
                        )}
                    </Button>
                </FormFooter>
            </CreateFlowShell>
        );
    }

    const chooserTitle = isInProject
        ? `Add New ${resourceTypeLabel}`
        : isConvertAndAdd
            ? `Convert to Project & Add New ${resourceTypeLabel}`
            : "Convert to Project";
    const chooserSubtitle = isInProject
        ? "Add an integration or library to your project."
        : "Organize your current integration inside a project.";

    return (
        <CreateFlowShell title={chooserTitle} subtitle={chooserSubtitle} onBack={goBack} fill>
            <AddProjectFormFields
                formData={formData}
                onFormDataChange={handleFormDataChange}
                isInProject={isInProject}
                addNewAfterConvert={addNewAfterConvert}
                onAddNewAfterConvertChange={setAddNewAfterConvert}
                projectNameValidationError={projectNameValidationError || undefined}
                convertPath={convertFullPath}
                onConvertPathChange={handleConvertPathChange}
                onConvertPathSelect={handleConvertPathSelect}
                convertPathError={convertPathError || undefined}
            />

            {/* The integration is named here rather than on a step of its own — the wizard
                is bypassed, so this screen submits. The library route keeps its own form,
                which collects a name alongside the package details omitted here. The WS
                bridge is what exposes the project listing behind the collision check. */}
            {isAddingIntegration && (
                <FormSection>
                    <BiWsClientProvider onBack={goBack}>
                        <AddComponentFields
                            formData={formData}
                            onFormDataChange={handleFormDataChange}
                            defaultsReady={defaultsReady}
                            projectPath={componentTargetPath}
                            reservedFolders={currentIntegrationDirName ? [currentIntegrationDirName] : undefined}
                            nameTouched={nameTouched}
                            onNameTouched={markNameTouched}
                            nameValidationError={componentNameValidationError || undefined}
                            onNameErrorChange={setComponentNameError}
                        />
                    </BiWsClientProvider>
                </FormSection>
            )}

            <FormFooter>
                {routeToNextScreen ? (
                    <Button disabled={nextDisabled} onClick={handleNext} appearance="primary">
                        Next
                    </Button>
                ) : isAddingIntegration ? (
                    <>
                        {pathValidationError && <SubmitError>{pathValidationError}</SubmitError>}
                        <Button
                            disabled={
                                nextDisabled ||
                                !!componentNameError ||
                                // The organization is not shown, not editable and not
                                // reportable on this route, so it is not gated on either —
                                // it is resolved for us and can arrive late, reserved, or
                                // never, each of which would otherwise disable this button
                                // with nothing on screen to explain it.
                                !isFormValidAddProject(formData, isInProject, addNewAfterConvert, {
                                    requireOrgName: false,
                                }) ||
                                isLoading ||
                                (isConvert && !!convertPathError)
                            }
                            onClick={handleAddProject}
                            appearance="primary"
                        >
                            {isLoading ? (
                                <Typography variant="progress">
                                    {isConvertAndAdd ? "Converting & Adding..." : "Adding..."}
                                </Typography>
                            ) : (
                                isConvertAndAdd ? "Convert & Add Integration" : "Add Integration"
                            )}
                        </Button>
                    </>
                ) : (
                    // Plain convert: nothing further to collect, so submit from here.
                    <Button
                        disabled={!isFormValidAddProject(formData, isInProject, addNewAfterConvert) || isLoading || (isConvert && !!convertPathError)}
                        onClick={handleAddProject}
                        appearance="primary"
                    >
                        {isLoading ? (
                            <Typography variant="progress">Converting...</Typography>
                        ) : (
                            "Convert to Project"
                        )}
                    </Button>
                )}
            </FormFooter>
        </CreateFlowShell>
    );
}
