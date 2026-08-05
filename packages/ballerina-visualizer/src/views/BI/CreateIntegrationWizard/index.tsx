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

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import styled from "@emotion/styled";
import { Icon, ThemeColors, Typography } from "@wso2/ui-toolkit";
import { Stepper } from "@wso2/ui-toolkit/lib/components/Stepper/Stepper";
import {
    INTEGRATION_ARTIFACT_LABELS,
    PendingIntegrationArtifactPayload,
    ServiceInitModel,
    TriggerModelsResponse,
    ValidateProjectFormErrorField,
} from "@wso2/ballerina-core";
import { useBiWsContext } from "../wsManager/WsClientContext";
import { HeaderRow, HeaderSubtitle, HeaderText, IconButton } from "../ImportIntegration/styles";
import { BackButtonSlot, StepBody, StepPinnedHeader, StepScrollArea, StepSectionLabel, WizardPage, WizardTopBar } from "./styles";
import { joinPath, sanitizePackageName, splitPath, validateComponentName } from "../ProjectForm/utils";
import { ArtifactCard } from "./artifactCatalog";
import { BasicInfo, ProjectContext, ScaffoldState, WizardStep } from "./types";
import { useRealtimeProjectPathValidation } from "./hooks/useRealtimeProjectPathValidation";
import { deriveDirectoryName, isDirectoryNameTouched } from "../ProjectForm/hooks/useDirectoryNameCoupling";
import {
    checkNameCollision as resolveNameCollisionMessage,
    resolveDefaultNameAndDirectory,
    toTakenNames,
    emptyTakenNames,
    TakenNames,
} from "../ProjectForm/hooks/resolveAvailableDirectoryName";
import { BasicInfoStep } from "./steps/BasicInfoStep";
import { IntegrationTypeStep } from "./steps/IntegrationTypeStep";
import { ConfigureStep } from "./steps/ConfigureStep";
import { WizardFooter } from "./components/WizardFooter";
import { CreatingIntegrationView } from "./components/CreatingIntegrationView";

const ErrorBanner = styled.div`
    margin-top: 16px;
    padding: 10px 12px;
    border-radius: 4px;
    border: 1px solid ${ThemeColors.ERROR};
    color: ${ThemeColors.ERROR};
    font-size: 13px;
`;

/** Step indices, in order. `NAME` is skipped when the package already exists. */
const NAME_STEP: WizardStep = 0;
const TYPE_STEP: WizardStep = 1;
const CONFIGURE_STEP: WizardStep = 2;
const WIZARD_STEPS = ["Name", "Type", "Configure"];
const DEFAULT_INTEGRATION_NAME = "Untitled";
const REQUIRED_PATH_MESSAGE = "Path is required";
const INVALID_PATH_MESSAGE = "Please select a valid directory";

interface CreateIntegrationWizardProps {
    /** Hide the page header when the embedding host renders its own chrome. */
    showHeader?: boolean;
    /** Project resolved by the Create chooser; seeds the path and hosts the new artifact (scaffolded fresh when `isNewProject`). */
    projectContext?: ProjectContext;
    /** Return to the chooser (screen 1); also shows the back arrow on step 0. */
    onBackToChooser?: () => void;
    /** Fill a bounded parent (the Create shell) instead of the viewport — skips the height-locking layout effect. */
    embedded?: boolean;
    /**
     * Run against an ALREADY-created package: the Type step collects only the artifact
     * type, and submit generates it in place. Mutually exclusive with `projectContext`.
     */
    existingPackagePath?: string;
    /** Fired after the artifact was added to `existingPackagePath`, so the host can
     *  dismiss the wizard and return to the view it was opened from. */
    onArtifactAdded?: () => void;
}

/**
 * The Create Integration wizard (Name → Type → Configure). Runs pre-project: a staging package
 * is scaffolded when Configure is entered, and the single `vscode.openFolder` reload
 * happens only at final submit, with the artifact persisted as a pending entry generated
 * post-reload. `existingPackagePath` flips it to generate-in-place.
 */
export function CreateIntegrationWizard({
    showHeader = true,
    projectContext,
    onBackToChooser,
    embedded = false,
    existingPackagePath,
    onArtifactAdded,
}: CreateIntegrationWizardProps) {
    const { wsClient, onBack } = useBiWsContext();
    // The package exists and keeps its name/location, so name/path/creation logic is inert.
    const isExistingPackage = !!existingPackagePath;
    // An existing package collects no name, so the Name step doesn't apply to it.
    const firstStep = isExistingPackage ? TYPE_STEP : NAME_STEP;

    const [step, setStep] = useState<WizardStep>(firstStep);
    const [basicInfo, setBasicInfo] = useState<BasicInfo>({
        integrationName: DEFAULT_INTEGRATION_NAME,
        baseDir: "",
        directoryName: sanitizePackageName(DEFAULT_INTEGRATION_NAME),
        dirTouched: false,
        pathTouched: false,
    });
    const [nameError, setNameError] = useState<string | null>(null);
    const [pathError, setPathError] = useState<string | null>(null);
    const [existingWorkspace, setExistingWorkspace] = useState(false);
    // Existing folders/titles in the target project, for live collision flagging.
    const [takenNames, setTakenNames] = useState<TakenNames>(emptyTakenNames());
    const [triggers, setTriggers] = useState<TriggerModelsResponse | null>(null);
    const [selection, setSelection] = useState<ArtifactCard | null>(null);
    // Cached per selected card so re-entering Configure skips the model fetch.
    const [serviceModelCache, setServiceModelCache] = useState<{ id: string; model: ServiceInitModel } | null>(null);
    const [scaffold, setScaffold] = useState<ScaffoldState>({ status: "idle" });
    const [isSubmitting, setIsSubmitting] = useState(false);
    // Artifact kind of the in-flight submit, for the progress screen's label.
    const [submittingKind, setSubmittingKind] = useState<PendingIntegrationArtifactPayload["kind"] | null>(null);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const scaffoldRef = useRef<ScaffoldState>(scaffold);
    scaffoldRef.current = scaffold;
    const rootRef = useRef<HTMLDivElement>(null);
    // Set the moment the user edits the name field, so the async seed below (which can
    // resolve after the user has already started typing) never clobbers it.
    const nameTouchedRef = useRef(false);
    // The location `takenNames` currently describes, so the refresh effect below can skip
    // the path the seed already fetched (and re-fetch whenever the user retargets).
    const takenNamesPathRef = useRef<string | null>(null);

    useLayoutEffect(() => {
        // The embedding chrome sizes its wrappers with `min-height`, so no ancestor has a
        // definite height and our scroll host's `overflow:auto` never engages — long content
        // grows the document instead. Give the scroll host a viewport-derived height and lock
        // the document. Not needed when embedded: the shell already bounds the height.
        if (embedded) {
            return;
        }

        const root = rootRef.current;
        if (!root) {
            return;
        }

        const findScrollHost = (start: HTMLElement): HTMLElement | null => {
            for (let node = start.parentElement; node && node !== document.body; node = node.parentElement) {
                const overflowY = getComputedStyle(node).overflowY;
                if (overflowY === "auto" || overflowY === "scroll") {
                    return node;
                }
            }
            return null;
        };

        const scrollHost = findScrollHost(root);
        const target = scrollHost ?? root;
        const MIN_HEIGHT = 200;

        // Belt-and-braces: stop the document itself from scrolling.
        const docEl = document.documentElement;
        const body = document.body;
        const prevDocOverflow = docEl.style.overflow;
        const prevBodyOverflow = body.style.overflow;
        docEl.style.overflow = "hidden";
        body.style.overflow = "hidden";

        // Preserve the styles we override on the (host-owned) scroll host.
        const prevHeight = target.style.height;
        const prevFlex = target.style.flex;
        const prevOverflow = target.style.overflow;
        let lastHeight = -1;

        const measure = () => {
            const top = target.getBoundingClientRect().top;

            // Space below the target that must stay visible (ancestors' bottom padding/borders + margins).
            let belowChrome = 0;
            for (let node: HTMLElement | null = target; node && node !== body; node = node.parentElement) {
                belowChrome += parseFloat(getComputedStyle(node).marginBottom) || 0;
                const parent = node.parentElement;
                if (!parent) {
                    break;
                }
                const parentStyle = getComputedStyle(parent);
                belowChrome += parseFloat(parentStyle.paddingBottom) || 0;
                belowChrome += parseFloat(parentStyle.borderBottomWidth) || 0;
            }

            const height = Math.max(Math.floor(window.innerHeight - top - belowChrome), MIN_HEIGHT);
            if (height === lastHeight) {
                return;
            }
            lastHeight = height;
            // flex:none stops the flex chain from overriding the fixed height;
            // overflow:hidden hands scrolling to our inner StepScrollArea.
            target.style.flex = "0 0 auto";
            target.style.height = `${height}px`;
            target.style.overflow = "hidden";
        };

        // `measure` reads layout for every ancestor, so coalesce the resize burst
        // into one measurement per frame.
        let resizeRaf = 0;
        const onResize = () => {
            if (resizeRaf) {
                return;
            }
            resizeRaf = requestAnimationFrame(() => {
                resizeRaf = 0;
                measure();
            });
        };

        measure();
        // Re-measure after paint settles and on resize; the height is viewport-derived.
        const raf1 = requestAnimationFrame(measure);
        const timer = window.setTimeout(measure, 250);
        window.addEventListener("resize", onResize);

        return () => {
            cancelAnimationFrame(raf1);
            cancelAnimationFrame(resizeRaf);
            window.clearTimeout(timer);
            window.removeEventListener("resize", onResize);
            docEl.style.overflow = prevDocOverflow;
            body.style.overflow = prevBodyOverflow;
            target.style.height = prevHeight;
            target.style.flex = prevFlex;
            target.style.overflow = prevOverflow;
        };
    }, [showHeader, embedded]);

    const effectiveName = basicInfo.integrationName.trim() || DEFAULT_INTEGRATION_NAME;
    const packageName = sanitizePackageName(effectiveName) || "untitled";
    // The name-derived default for the directory segment (empty until a name is typed).
    const autoDirectoryName = basicInfo.integrationName.trim() ? sanitizePackageName(basicInfo.integrationName) : "";
    // Once the user edits the path, the segment is honored exactly — including empty
    // ("create in the parent dir").
    const trimmedDirectoryName = basicInfo.directoryName.trim();
    const effectiveDirectoryName = basicInfo.dirTouched ? trimmedDirectoryName : trimmedDirectoryName || packageName;
    const fullPath = joinPath(basicInfo.baseDir, basicInfo.directoryName);
    const createDisabled = isSubmitting || !!nameError || (!embedded && !!pathError);

    useEffect(() => {
        // Sweep any temp staging package left by an abandoned session (the unmount cancel can be lost).
        wsClient
            .cleanupAbandonedIntegrationScaffolds()
            .catch((error: unknown) => console.error(">>> Error cleaning up staging package", error));

        // Seed the path: the chooser's project when there is one, else the open folder /
        // default creation dir. The default name/folder is indexed ("Untitled_2") when it
        // would collide. Not needed for an existing package.
        if (!isExistingPackage) {
            const seedBaseDir = projectContext?.workspacePath
                ? Promise.resolve(projectContext.workspacePath)
                : wsClient.getWorkspaceRoot().then(async (res: { path: string }) => res.path || (await wsClient.getDefaultCreationPath()).path);

            seedBaseDir
                .then(async (seedPath: string) => {
                    // Resolved here (not in the refresh effect below) so the indexed default
                    // name/folder is committed together with the path — no render pairs a real
                    // path with an un-indexed default. The effect below keeps it current if the
                    // user later retargets the location.
                    let taken = emptyTakenNames();
                    try {
                        taken = toTakenNames(await wsClient.getProjectComponentNames({ projectPath: seedPath }));
                    } catch (error) {
                        console.error(">>> Error fetching existing component names", error);
                    }
                    takenNamesPathRef.current = seedPath;
                    setTakenNames(taken);
                    const { name, directoryName } = resolveDefaultNameAndDirectory(DEFAULT_INTEGRATION_NAME, taken, sanitizePackageName);
                    setBasicInfo((prev) => {
                        if (prev.baseDir) {
                            return prev;
                        }
                        if (nameTouchedRef.current) {
                            // The user already started naming their own integration while this
                            // was in flight — the seeded default name/directory pair (computed
                            // for DEFAULT_INTEGRATION_NAME) no longer applies; only seed the location.
                            return { ...prev, baseDir: seedPath };
                        }
                        return { ...prev, baseDir: seedPath, integrationName: name, directoryName };
                    });
                })
                .catch((error: unknown) => console.error(">>> Error seeding the creation path", error));
        }

        wsClient
            .getTriggerModels({ query: "" })
            .then((res) => setTriggers(res))
            .catch((error: unknown) => console.error(">>> Error fetching trigger models", error));
    }, [wsClient, projectContext?.workspacePath, isExistingPackage]);

    // The collision list describes one location, but Browse / editing the path can retarget
    // it (standalone mounts only — the embedded flow hides the path field). Without this the
    // snapshot stays pinned to the seed folder, so a name that is free in the newly chosen
    // project keeps being rejected — and, because `nameError` disables both footer buttons,
    // there is no way past it except renaming. Debounced to match the path validation hook,
    // which is keyed on the same value.
    useEffect(() => {
        const targetPath = basicInfo.baseDir.trim();
        if (isExistingPackage || !targetPath || targetPath === takenNamesPathRef.current) {
            return;
        }
        let cancelled = false;
        const timer = setTimeout(async () => {
            let taken = emptyTakenNames();
            try {
                taken = toTakenNames(await wsClient.getProjectComponentNames({ projectPath: targetPath }));
            } catch (error) {
                // Fail open: an empty list only defers collision reporting to submit-time
                // validation, whereas keeping the previous location's list would block
                // names that are actually free here.
                console.error(">>> Error refreshing existing component names", error);
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
    }, [wsClient, basicInfo.baseDir, isExistingPackage]);

    // Re-run the name check whenever the collision list changes: unlike the path
    // diagnostics (owned by the hook above), `nameError` is set imperatively by
    // `handleNameChange`, so a refreshed list would otherwise leave a stale error on
    // screen — and the buttons disabled — until the user edited the name again.
    useEffect(() => {
        if (!basicInfo.integrationName.trim()) {
            // Leave a pending "name is required" in place; typing recomputes it.
            return;
        }
        setNameError(
            validateComponentName(basicInfo.integrationName, false) ||
            resolveNameCollisionMessage(basicInfo.integrationName, takenNames, sanitizePackageName)
        );
    }, [takenNames, basicInfo.integrationName]);

    useEffect(() => {
        // Best-effort discard; the mount-time sweep is the race-free backstop.
        return () => {
            if (scaffoldRef.current.status === "ready") {
                wsClient.cancelIntegrationWizard().catch(() => { });
            }
        };
    }, [wsClient]);

    useRealtimeProjectPathValidation({
        wsClient,
        projectPath: basicInfo.baseDir,
        projectName: packageName,
        createAsWorkspace: false,
        // Validate as soon as baseDir + a directory segment exist (before any edit), so a
        // "directory exists" conflict shows live. Never for an existing package.
        pathTouched:
            !isExistingPackage &&
            (basicInfo.pathTouched ||
                (basicInfo.baseDir.trim().length > 0 && basicInfo.directoryName.trim().length > 0)),
        requiredPathMessage: REQUIRED_PATH_MESSAGE,
        invalidPathMessage: INVALID_PATH_MESSAGE,
        onPathErrorChange: useCallback((error: string | null) => setPathError(error), []),
        onExistingWorkspaceChange: useCallback((isWorkspace: boolean) => setExistingWorkspace(isWorkspace), []),
        directoryName: effectiveDirectoryName,
        // The path field is the exact project root, so an existing (non-Ballerina) dir is allowed.
        allowExistingDirectory: true,
    });

    /** Returns a diagnostic when the name collides with an existing integration or
     *  library in the target project (by folder or by title), else null. */
    const checkNameCollision = (value: string): string | null =>
        resolveNameCollisionMessage(value, takenNames, sanitizePackageName);

    /** Integration name change — also re-derives the directory segment while the
     *  user has not taken manual control of it. */
    const handleNameChange = (value: string) => {
        nameTouchedRef.current = true;
        setBasicInfo((prev) => ({
            ...prev,
            integrationName: value,
            directoryName: deriveDirectoryName(value, prev.dirTouched, prev.directoryName, sanitizePackageName),
        }));
        setNameError(validateComponentName(value, false) || checkNameCollision(value));
    };

    /** Path field edit — re-split into parent directory + directory name. Editing
     *  the last segment away from the name-derived default takes manual control of
     *  it (so subsequent name edits no longer overwrite it). */
    const handlePathChange = (value: string) => {
        const { base, name } = splitPath(value);
        setBasicInfo((prev) => ({
            ...prev,
            baseDir: base,
            directoryName: name,
            dirTouched: isDirectoryNameTouched(name, autoDirectoryName),
            pathTouched: true,
        }));
    };

    const handleBrowse = async () => {
        try {
            const res = await wsClient.selectFileOrDirPath({});
            if (res?.path) {
                setBasicInfo((prev) => ({ ...prev, baseDir: res.path, pathTouched: true }));
            }
        } catch (error) {
            console.error(">>> Error selecting directory", error);
        }
    };

    /** Submit-time path check shared by Continue and every skip path. */
    const validatePathForSubmit = async (): Promise<boolean> => {
        const trimmedPath = basicInfo.baseDir.trim();
        if (!trimmedPath) {
            setPathError(REQUIRED_PATH_MESSAGE);
            return false;
        }
        try {
            const result = await wsClient.validateProjectPath({
                projectPath: trimmedPath,
                projectName: packageName,
                createDirectory: true,
                directoryName: effectiveDirectoryName,
                allowExistingDirectory: true,
            });
            if (!result.isValid) {
                if (result.errorField === ValidateProjectFormErrorField.NAME) {
                    setNameError(result.errorMessage || "Invalid integration name");
                } else {
                    setPathError(result.errorMessage || INVALID_PATH_MESSAGE);
                }
                setStep(0);
                return false;
            }
            return true;
        } catch (error) {
            console.error(">>> Error validating project path", error);
            setPathError(INVALID_PATH_MESSAGE);
            // Both the name and the path live on the Name step.
            setStep(NAME_STEP);
            return false;
        }
    };

    const validateBasicInfo = (): boolean => {
        const nameValidation = basicInfo.integrationName.trim()
            ? (validateComponentName(basicInfo.integrationName, false) || checkNameCollision(basicInfo.integrationName))
            : null;
        setNameError(nameValidation);
        return !nameValidation;
    };

    /**
     * Creates the throwaway staging package once per session (name/path agnostic, so it is reused).
     */
    const ensureScaffold = async () => {
        if (scaffold.status === "ready" || scaffold.status === "creating") {
            return;
        }
        setScaffold({ status: "creating" });
        try {
            const res = await wsClient.scaffoldIntegrationProject();
            setScaffold({ status: "ready", projectRoot: res.projectRoot });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(">>> Error preparing the integration form", error);
            setScaffold({ status: "error", error: `Failed to set up the integration: ${message}` });
        }
    };

    /** Name → Type: validate the name (and, when standalone, the path) before advancing. */
    const handleContinueToType = async () => {
        if (!basicInfo.integrationName.trim()) {
            setNameError("Integration name is required");
            return;
        }
        if (!validateBasicInfo()) {
            return;
        }
        // The chooser already validated the location in the embedded flow.
        if (!embedded && !(await validatePathForSubmit())) {
            return;
        }
        setStep(TYPE_STEP);
    };

    /** Type → Configure: a type must be selected; entering Configure needs the staging package. */
    const handleContinueToConfigure = () => {
        if (!selection) {
            return;
        }
        setStep(CONFIGURE_STEP);
        void ensureScaffold();
    };

    /**
     * Existing-package submit: generate the artifact in place — no project creation, no reload.
     */
    const handleAddArtifactToExistingPackage = async (packageRoot: string, artifact: PendingIntegrationArtifactPayload) => {
        setSubmitError(null);
        setSubmittingKind(artifact.kind);
        setIsSubmitting(true);
        try {
            await wsClient.addIntegrationArtifact({ packageRoot, artifact });
            onArtifactAdded?.();
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(">>> Error adding the integration artifact", error);
            setSubmitError(`Failed to add the integration: ${message}`);
            setIsSubmitting(false);
        }
    };

    /** Final submit — with an artifact after Configure, without one on any skip.
     *  The real project is created fresh at the final path here (and only here);
     *  the standalone wizard re-validates the path (the embedded flow trusts the
     *  chooser's validation). */
    const handleCreateIntegration = async (
        artifact?: PendingIntegrationArtifactPayload,
        startWithCopilot?: boolean
    ) => {
        setSubmitError(null);
        if (!embedded && !(await validatePathForSubmit())) {
            return;
        }
        setSubmittingKind(artifact?.kind ?? null);
        setIsSubmitting(true);
        try {
            await wsClient.createIntegration({
                project: {
                    integrationName: effectiveName,
                    packageName,
                    projectPath: basicInfo.baseDir.trim(),
                    directoryName: effectiveDirectoryName,
                    newProject: projectContext?.isNewProject,
                    workspaceName: projectContext?.workspaceName,
                    convertToWorkspace: projectContext?.convertToWorkspace,
                },
                artifact,
                startWithCopilot,
            });
            // The extension reloads the window — stay in the submitting state until teardown.
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(">>> Error creating integration", error);
            setSubmitError(`Failed to create the integration: ${message}`);
            setIsSubmitting(false);
        }
    };

    /** Creates the integration empty and lands on it, ready for the Copilot prompt bar. */
    const handleStartWithCopilot = (): void => {
        void handleCreateIntegration(undefined, true);
    };

    /** Routes the configured artifact to the mode's submit path: generate into the
     *  existing package, or create the package and its first artifact together. */
    const handleConfiguredArtifact = (artifact: PendingIntegrationArtifactPayload) => {
        if (existingPackagePath) {
            void handleAddArtifactToExistingPackage(existingPackagePath, artifact);
            return;
        }
        void handleCreateIntegration(artifact);
    };

    // Nothing is interactive once submit is in flight (and the window may reload), so show a
    // dedicated progress screen — the extension's startup screen continues the same layout.
    if (isSubmitting) {
        const artifactLabel = submittingKind ? INTEGRATION_ARTIFACT_LABELS[submittingKind] : undefined;
        return (
            <WizardPage ref={rootRef} embedded={embedded}>
                {isExistingPackage ? (
                    <CreatingIntegrationView variant="add" artifactLabel={artifactLabel} />
                ) : (
                    <CreatingIntegrationView
                        variant="create"
                        integrationName={effectiveName}
                        artifactLabel={artifactLabel}
                        projectName={projectContext?.workspaceName}
                        isNewProject={projectContext?.isNewProject}
                    />
                )}
            </WizardPage>
        );
    }

    return (
        <WizardPage ref={rootRef} embedded={embedded}>
            {showHeader && (
                <HeaderRow>
                    <IconButton type="button" onClick={onBack} title="Go back">
                        <Icon
                            name="arrow-left"
                            isCodicon
                            sx={{ width: "16px", height: "16px", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                            iconSx={{ color: "var(--vscode-foreground)", fontSize: "16px", lineHeight: 1 }}
                        />
                    </IconButton>
                    <HeaderText>
                        <Typography variant="h2" sx={{ margin: 0, fontWeight: 600 }}>
                            Create Integration
                        </Typography>
                        <HeaderSubtitle>Start building a new integration.</HeaderSubtitle>
                    </HeaderText>
                </HeaderRow>
            )}
            <WizardTopBar>
                {(step > firstStep || onBackToChooser) && (
                    <BackButtonSlot>
                        <IconButton
                            type="button"
                            onClick={() => (step > firstStep ? setStep((step - 1) as WizardStep) : onBackToChooser?.())}
                            disabled={isSubmitting}
                            title={step > firstStep ? "Previous step" : "Back"}
                        >
                            <Icon
                                name="arrow-left"
                                isCodicon
                                sx={{ width: "16px", height: "16px", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                                iconSx={{ color: "var(--vscode-foreground)", fontSize: "16px", lineHeight: 1 }}
                            />
                        </IconButton>
                    </BackButtonSlot>
                )}
                <Stepper
                    alignment="center"
                    // The existing-package mode has no Name step, so drop it from the rail too.
                    steps={isExistingPackage ? WIZARD_STEPS.slice(1) : WIZARD_STEPS}
                    currentStep={step - firstStep}
                />
            </WizardTopBar>
            <StepBody>
                {step === TYPE_STEP && (
                    <StepPinnedHeader>
                        <StepSectionLabel>Select the type of integration to build</StepSectionLabel>
                    </StepPinnedHeader>
                )}
                {/* The Name step is a single field, so keep the footer next to it rather
                    than stretched to the panel's bottom edge. */}
                <StepScrollArea fitContent={step === NAME_STEP}>
                    {step === NAME_STEP && (
                        <BasicInfoStep
                            integrationName={basicInfo.integrationName}
                            fullPath={fullPath}
                            nameError={nameError}
                            pathError={pathError}
                            existingWorkspace={existingWorkspace}
                            onNameChange={handleNameChange}
                            onPathChange={handlePathChange}
                            onBrowse={handleBrowse}
                            hidePath={embedded}
                        />
                    )}
                    {step === TYPE_STEP && (
                        <IntegrationTypeStep
                            triggers={triggers}
                            selection={selection}
                            compact={embedded}
                            onSelect={(card) => {
                                if (card.id !== selection?.id) {
                                    setServiceModelCache(null);
                                }
                                setSelection(card);
                            }}
                        />
                    )}
                    {step === CONFIGURE_STEP && selection && (
                        <ConfigureStep
                            wsClient={wsClient}
                            selection={selection}
                            scaffold={scaffold}
                            isSubmitting={isSubmitting}
                            cachedServiceModel={serviceModelCache?.id === selection.id ? serviceModelCache.model : null}
                            onServiceModelLoaded={(model) => setServiceModelCache({ id: selection.id, model })}
                            onSubmit={handleConfiguredArtifact}
                        />
                    )}
                </StepScrollArea>
                {submitError && <ErrorBanner>{submitError}</ErrorBanner>}
                {/* Configure owns its own submit button ("Create Integration"), so the
                    shared footer only applies to the Name and Type steps. */}
                {step !== CONFIGURE_STEP && (
                    <WizardFooter
                        primaryLabel="Next"
                        onPrimary={step === NAME_STEP ? handleContinueToType : handleContinueToConfigure}
                        primaryDisabled={
                            isSubmitting ||
                            !!nameError ||
                            (!embedded && !!pathError) ||
                            (step === TYPE_STEP && !selection)
                        }
                        // The package already exists and is empty — only Next applies.
                        // Only offered on the Name step; the Type step requires a selection.
                        skipLabel={!isExistingPackage && step === NAME_STEP ? "Create Empty Integration" : undefined}
                        onSkip={() => handleCreateIntegration()}
                        skipDisabled={createDisabled}
                        copilotLabel={!isExistingPackage && step === NAME_STEP ? "Start with Copilot" : undefined}
                        onCopilot={handleStartWithCopilot}
                        copilotDisabled={createDisabled}
                    />
                )}
            </StepBody>
        </WizardPage>
    );
}

export default CreateIntegrationWizard;
