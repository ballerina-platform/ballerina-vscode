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

import React, { useCallback, useEffect, useMemo, useState } from "react";
import styled from "@emotion/styled";
import { Button, ProgressRing, ThemeColors, Typography } from "@wso2/ui-toolkit";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { AddProjectFormFields } from "./AddProjectFormFields";
import { AddLibraryFields } from "./AddLibraryFields";
import { useProductTerms } from "./useProductTerms";
import { AddProjectFormData } from "./types";
import { isFormValidAddProject, joinPath, sanitizeOrgHandle, sanitizePackageName, splitPath } from "./utils";
import { useRealtimeProjectPathValidation } from "../CreateIntegrationWizard/hooks/useRealtimeProjectPathValidation";
import { ProductMode, ValidateProjectFormErrorField } from "@wso2/ballerina-core";
import { useProductMode } from "../../../hooks/useProductMode";
import { ProjectContext } from "../CreateIntegrationWizard/types";
import { BiWsClientProvider } from "../wsManager/WsClientContext";
import { CreateFlowShell } from "./embedded/integrator-form/shared/CreateFlowShell";
import { FormFooter } from "./embedded/integrator-form/shared/FormPageLayout";
import { useDirectoryNameCoupling } from "./hooks/useDirectoryNameCoupling";
import { useDefaultOrgName } from "./hooks/useDefaultOrgName";
import { prefetchChunks } from "../../../utils/viewPrefetch";

/** Which screen of the Add-to-project flow is showing. */
type Screen = "chooser" | "integration" | "library";

/**
 * Lazy: the wizard pulls the whole artifact-form tree, so the chooser must not wait on
 * it. Warmed as soon as the chooser mounts.
 */
const LazyCreateIntegrationWizard = React.lazy(() =>
    import("../CreateIntegrationWizard").then((module) => ({ default: module.CreateIntegrationWizard }))
);

/** Submit-time error beside the action button, for failures with no single field. */
const WizardLoader = styled.div`
    flex: 1;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
`;

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
    // chooser = project + starting point; integration = the Create wizard in place;
    // library = name + package details.
    const [screen, setScreen] = useState<Screen>("chooser");
    const [targetPath, setTargetPath] = useState<string>("");
    // Title of the already-open project, for the wizard's "Adding … to project X" copy.
    const [openProjectName, setOpenProjectName] = useState<string>("");
    // Convert flow: `convertBaseDir` is the parent location; the folder name defaults to
    // the project name until edited.
    const [convertBaseDir, setConvertBaseDir] = useState<string>("");
    const convertDirCoupling = useDirectoryNameCoupling("", sanitizePackageName);
    const [convertPathError, setConvertPathError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [pathValidationError, setPathValidationError] = useState<string | null>(null);
    const [packageNameValidationError, setPackageNameValidationError] = useState<string | null>(null);
    const [projectNameValidationError, setProjectNameValidationError] = useState<string | null>(null);
    const terms = useProductTerms();
    // The artifact type is not a choice in Agent Builder, so the wizard collapses to
    // its Name step and creates the empty integration from there.
    const isAgentBuilder = useProductMode() === ProductMode.AGENT_BUILDER;
    const resourceTypeLabel = formData.isLibrary ? "Library" : terms.integrationLabel;
    const isConvert = !isInProject;
    const isConvertAndAdd = isConvert && addNewAfterConvert;
    // Whether a starting point (integration/library) is being added (vs a plain convert).
    const isAddingComponent = isInProject || addNewAfterConvert;
    // A starting point is configured on the next screen ("Next"); a plain convert submits from here.
    const routeToNextScreen = isAddingComponent;

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

    // Live name diagnostic from the library screen (format + collision with an
    // existing integration/library in the target project). Blocks submit there.
    const [componentNameError, setComponentNameError] = useState<string | null>(null);

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

    // Both starting points lead into the wizard, so start pulling its chunk while the
    // user is still reading the chooser.
    useEffect(() => {
        prefetchChunks(["createIntegrationWizard"]);
    }, []);

    useEffect(() => {
        Promise.all([
            rpcClient.getCommonRpcClient().getWorkspaceRoot(),
            rpcClient.getCommonRpcClient().getWorkspaceType()
        ]).then(async ([workspaceRoot, workspaceType]) => {
            const inProject = workspaceType.type === "BALLERINA_WORKSPACE";
            setTargetPath(workspaceRoot.path);
            // The converted project is created next to the current integration by
            // default, so seed the location with the integration's parent directory.
            const { base, name } = splitPath(workspaceRoot.path);
            setConvertBaseDir(base);
            setCurrentIntegrationDirName(inProject ? "" : name);
            setIsInProject(inProject);

            if (inProject) {
                // Only needed to name the project on the wizard's progress screen, so a
                // failure here just leaves that copy unnamed.
                try {
                    const structure = await rpcClient.getBIDiagramRpcClient().getProjectStructure();
                    setOpenProjectName(structure?.workspaceTitle || structure?.workspaceName || name);
                } catch {
                    setOpenProjectName(name);
                }
            }

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

    // The project the wizard adds into: the open workspace, or a new one from converting
    // the current integration.
    const integrationProjectContext: ProjectContext = isInProject
        ? { isNewProject: false, workspacePath: targetPath, workspaceName: openProjectName || undefined }
        : {
            isNewProject: true,
            workspacePath: convertFullPath,
            workspaceName: formData.workspaceName?.trim() || undefined,
            convertToWorkspace: true,
        };

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

    /** Chooser → the starting point's own screen (integration wizard or library form).
     *  In the convert flow the project name + location are captured (and validated)
     *  here first; the next screen then owns naming/configuring the artifact and the
     *  convert-and-add on submit. */
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
        setScreen(formData.isLibrary ? "library" : "integration");
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
                        // The package name is edited in the library screen's Advanced
                        // Configurations, which is where this submit came from.
                        setPackageNameValidationError(
                            validationResult.errorMessage || `Invalid ${resourceTypeLabel.toLowerCase()} name`
                        );
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
                orgHandle,
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

    if (screen === "integration") {
        return (
            <CreateFlowShell
                title={`New ${terms.integrationLabel}`}
                subtitle={startingPointSubtitle}
                onBack={() => setScreen("chooser")}
                bodyFill
                fill
            >
                <BiWsClientProvider onBack={() => setScreen("chooser")}>
                    <React.Suspense
                        fallback={
                            <WizardLoader>
                                <ProgressRing color={ThemeColors.PRIMARY} />
                            </WizardLoader>
                        }
                    >
                        <LazyCreateIntegrationWizard
                            embedded
                            showHeader={false}
                            projectContext={integrationProjectContext}
                            nameOnly={isAgentBuilder}
                            nameLabel={isAgentBuilder ? terms.integrationNameLabel : undefined}
                        />
                    </React.Suspense>
                </BiWsClientProvider>
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
                    exposed on the WS bridge, the same seam the integration wizard
                    below uses. */}
                <BiWsClientProvider onBack={() => setScreen("chooser")}>
                    <AddLibraryFields
                        formData={formData}
                        onFormDataChange={handleFormDataChange}
                        projectPath={isInProject ? targetPath : convertFullPath}
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
        ? `Add an ${terms.integrationNoun} or library to your project.`
        : `Organize your current ${terms.integrationNoun} inside a project.`;

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

            <FormFooter>
                {routeToNextScreen ? (
                    <Button disabled={nextDisabled} onClick={handleNext} appearance="primary">
                        Next
                    </Button>
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
