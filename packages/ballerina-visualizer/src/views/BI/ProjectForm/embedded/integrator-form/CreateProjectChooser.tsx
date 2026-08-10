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
import styled from "@emotion/styled";
import { Button, DirectorySelector, Icon, TextField } from "@wso2/ui-toolkit";
import { useVisualizerContext } from "./context/WsClientContext";
import {
    joinPath,
    splitPath,
    sanitizePackageName,
    validateComponentName,
    validateProjectName,
} from "./utils";
import { useRealtimeProjectPathValidation } from "./useRealtimeProjectPathValidation";
import { FieldGroup, ProjectSectionContainer } from "./styles";
import { DEFAULT_INTEGRATION_NAME, DEFAULT_PROJECT_NAME } from "./types";
import { CreateFlowShell } from "./shared/CreateFlowShell";
import { FormFooter } from "./shared/FormPageLayout";
import { useDirectoryNameCoupling } from "../../hooks/useDirectoryNameCoupling";
import {
    checkNameCollision as resolveNameCollisionMessage,
    resolveDefaultNameAndDirectory,
    toTakenNames,
    emptyTakenNames,
    TakenNames,
} from "../../hooks/resolveAvailableDirectoryName";
import { LibraryCreationView } from "./LibraryCreationView";
import { ProjectTypeSelector } from "../../components";
import { CreatingIntegrationView } from "../../../CreateIntegrationWizard/components/CreatingIntegrationView";
import { ProjectContext } from "../../../CreateIntegrationWizard/types";
import { BiWsClient } from "../../../wsManager/WsClient";

/** A group of related fields, separated by generous whitespace rather than a
 *  hard divider so the form reads as a couple of calm sections. */
const Section = styled.section`
    & + & {
        margin-top: 32px;
    }
`;

/** The bordered box around Project name + Location.
 *
 *  Neutralizes `ProjectSectionContainer`'s `:focus-within` recolor — each field already
 *  draws its own focus ring — scoped here so `ProjectFormFields` keeps the shared behavior. */
const ProjectGroupContainer = styled(ProjectSectionContainer)`
    &:focus-within {
        border-color: var(--vscode-panel-border);
    }
`;

/** Padded interior of the bordered project group. `ProjectSectionContainer`
 *  carries no padding of its own; the last field's bottom margin is zeroed so the
 *  status footer sits flush. */
const ProjectGroupFields = styled.div`
    padding: 12px;

    & > *:last-child {
        margin-bottom: 0;
    }
`;

/** Live, derived status of the project group: do the current Project name +
 *  Location resolve to a brand-new project, or to one that already exists?
 *
 *  Styled as a tinted strip sealed to the container rather than as a `Note` callout,
 *  which the starting-point section below already uses. Hitting an existing project is
 *  not an error — it is a legal target — but it silently changes what Create does, so
 *  it is toned as a warning rather than as neutral info. The duplicate `background` is
 *  a fallback for runtimes without `color-mix()` (Chromium < 111). */
const ProjectStatusStrip = styled.div<{ isWarning?: boolean }>`
    display: flex;
    align-items: flex-start;
    gap: 6px;
    padding: 8px 12px;
    font-size: 12px;
    line-height: 1.4;
    color: var(--vscode-descriptionForeground);
    background: ${(props: { isWarning?: boolean }) =>
        props.isWarning
            ? "var(--vscode-inputValidation-warningBackground, var(--vscode-sideBar-background))"
            : "var(--vscode-inputValidation-infoBackground, var(--vscode-sideBar-background))"};
    background: ${(props: { isWarning?: boolean }) =>
        props.isWarning
            ? "color-mix(in srgb, var(--vscode-editorWarning-foreground) 14%, var(--vscode-editor-background))"
            : "color-mix(in srgb, var(--vscode-textLink-foreground) 12%, var(--vscode-editor-background))"};
    border-top: 1px solid var(--vscode-panel-border);
`;

/** The scannable half of the status ("New project" / "Existing project"),
 *  lifted above the trailing detail clause so the key distinction registers at
 *  a glance. The new-project case stays on the plain foreground — it needs no
 *  louder color; the existing-project case carries the warning tone. */
const ProjectStatusLead = styled.span<{ isWarning?: boolean }>`
    color: ${(props: { isWarning?: boolean }) =>
        props.isWarning ? "var(--vscode-editorWarning-foreground)" : "var(--vscode-foreground)"};
    font-weight: 500;
`;

/** Sizing for the status icon: boxed to the 12px/1.4 line height of the strip
 *  so it optically centers on the first line, and non-interactive (the shared
 *  `Icon` container defaults to `cursor: pointer`). */
const STATUS_ICON_SX = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "16px",
    height: "17px",
    flexShrink: 0,
    cursor: "default",
} as const;

/** Nudged down from the codicon default of 16px to sit comfortably beside 12px text. */
const STATUS_ICON_GLYPH_SX = { fontSize: "14px" } as const;

/** Same sizing, warning-toned — the glyph would otherwise inherit the strip's
 *  muted description color and read as neutral info. */
const STATUS_ICON_WARNING_GLYPH_SX = {
    ...STATUS_ICON_GLYPH_SX,
    color: "var(--vscode-editorWarning-foreground)",
} as const;

/** Frame budget for the Project name preselect retry (~0.5s at 60fps). Only a
 *  backstop: the field is normally ready within a frame or two, and this just
 *  guarantees a mount that never satisfies the readiness check still ends up
 *  focused instead of retrying forever. */
const PRESELECT_MAX_FRAMES = 30;

/** Form-level failure from the create call itself — the fields are all valid at
 *  that point, so there is no single input to hang the message off. */
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

/**
 * Which screen of the Create flow is showing. The integration route no longer has
 * a screen of its own: the 3-step integration wizard (Name → Type → Configure) is
 * bypassed for now, and the chooser collects the integration name inline and
 * creates an empty integration directly. Restore the `"integration"` screen (and
 * the `CreateIntegrationWizard` render behind it) to bring the wizard back.
 */
type Screen = "chooser" | "library";

interface CreateProjectChooserProps {
    /** The wizard client (native BI WS) used by the integration route. */
    biWsClient: BiWsClient;
    ballerinaUnavailable?: boolean;
    /**
     * The extension has not yet determined whether the connected distribution supports
     * projects/workspaces. The form is fully usable meanwhile — only leaving this screen
     * is held back, because the answer decides which flow the user is routed into.
     */
    workspaceSupportPending?: boolean;
    /** Exit the whole Create flow (back to the welcome view). */
    onBack?: () => void;
}

/**
 * Screen 1 of the Create flow: pick the project and the starting point (integration or
 * library). The Default project is pre-selected; existing vs new is detected live and
 * shown under the location field.
 *
 * The integration route finishes here — the name the wizard's first step used to collect
 * is asked for inline, and Create submits an empty integration. The library route still
 * hands off to the library form in the same shell.
 */
export function CreateProjectChooser({
    biWsClient,
    ballerinaUnavailable,
    workspaceSupportPending,
    onBack,
}: CreateProjectChooserProps) {
    const { wsClient } = useVisualizerContext();
    const firstFieldRef = useRef<HTMLInputElement>(null);
    const defaultPathInitialized = useRef(false);
    const projectNameTouchedRef = useRef(false);
    // Set the moment the user edits the integration name, so the async default-name
    // indexing below never clobbers what they typed.
    const integrationNameTouchedRef = useRef(false);
    // The location `takenNames` currently describes, so the refresh effect below can
    // skip a path it has already listed (and re-list whenever the project retargets).
    const takenNamesPathRef = useRef<string | null>(null);

    const [screen, setScreen] = useState<Screen>("chooser");
    const [isLibrary, setIsLibrary] = useState(false);

    const [integrationName, setIntegrationName] = useState(DEFAULT_INTEGRATION_NAME);
    const [integrationNameError, setIntegrationNameError] = useState<string | null>(null);
    // Folders/titles already used in the target project, for live collision flagging.
    const [takenNames, setTakenNames] = useState<TakenNames>(emptyTakenNames());
    // Submit-time re-check of the collision list, before anything is created.
    const [isValidating, setIsValidating] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [createError, setCreateError] = useState<string | null>(null);

    const [projectName, setProjectName] = useState(DEFAULT_PROJECT_NAME);
    const dirCoupling = useDirectoryNameCoupling(() => sanitizePackageName(DEFAULT_PROJECT_NAME), sanitizePackageName);
    const { directoryName, dirTouched } = dirCoupling;
    const [defaultPath, setDefaultPath] = useState("");
    const [editablePath, setEditablePath] = useState("");
    const [pathTouched, setPathTouched] = useState(false);
    const [projectNameError, setProjectNameError] = useState<string | null>(null);
    const [pathError, setPathError] = useState<string | null>(null);
    const [existingWorkspace, setExistingWorkspace] = useState(false);
    /** Bumped whenever the pre-filled Project name is replaced programmatically, to
     *  re-run the preselect below. */
    const [preselectRequestId, setPreselectRequestId] = useState(0);

    const debouncedSetProjectNameError = useMemo(
        () => debounce((error: string) => setProjectNameError(error), 300),
        []
    );

    const debouncedSetIntegrationNameError = useMemo(
        () => debounce((error: string) => setIntegrationNameError(error), 300),
        []
    );

    const autoDirectoryName = projectName.trim() ? sanitizePackageName(projectName) : "";
    const effectiveDirectoryName = dirTouched ? directoryName.trim() : (directoryName.trim() || autoDirectoryName);
    const resolvedPath = editablePath ? joinPath(editablePath, effectiveDirectoryName) : "";

    // The integration package created inside the project. Its folder and its Ballerina
    // package name are both derived from the name — unlike the wizard there is no
    // editable path field here, since the location is already resolved above.
    const effectiveIntegrationName = integrationName.trim() || DEFAULT_INTEGRATION_NAME;
    const integrationPackageName = sanitizePackageName(effectiveIntegrationName) || "untitled";
    // Resolved synchronously — the displayed diagnostic is debounced, so gating Create on
    // the error state alone would leave it clickable for a beat after a bad edit.
    const integrationNameIssue =
        validateComponentName(integrationName) ||
        resolveNameCollisionMessage(integrationName, takenNames, sanitizePackageName);

    // Seed the Default project location once (`<defaultLocation>/default`). The
    // realtime validation then reports whether it already exists (add into it) or
    // is new (created on submit).
    useEffect(() => {
        let mounted = true;
        (async () => {
            if (defaultPathInitialized.current) return;
            try {
                const { path: workspacePath } = await wsClient.getWorkspaceRoot();
                if (!mounted) return;
                const dp = workspacePath || (await wsClient.getDefaultCreationPath()).path;
                if (!mounted) return;
                defaultPathInitialized.current = true;
                setDefaultPath(dp);
                setEditablePath(dp);

                // If the default project already exists, show its real name (from its
                // Ballerina.toml) instead of the "Default" placeholder — matching what
                // Browse does. The folder stays "default"; only the display name changes.
                const defaultProjectPath = joinPath(dp, directoryName);
                const info = await wsClient.getExistingProjectInfo({ projectPath: defaultProjectPath });
                if (!mounted) return;
                if (info?.isProject && info.name && !projectNameTouchedRef.current) {
                    setProjectName(info.name);
                    dirCoupling.setDirTouched(true);
                    // This swap lands after the initial preselect has already run and
                    // silently collapses its selection, so ask for another one.
                    setPreselectRequestId((id) => id + 1);
                }
            } catch (error) {
                console.error("Failed to fetch default path:", error);
            }
        })();
        return () => { mounted = false; };
    }, [wsClient]);

    // Focus + select the Project name field on every arrival at the chooser. A bare
    // setTimeout(0)+select() fails twice over: (1) the async seed above can replace the
    // name afterwards, and re-assigning the web component's value collapses the selection
    // — `preselectRequestId` re-runs this; (2) the real <input> lives in
    // `vscode-text-field`'s shadow root and may not be attached yet, hence the bounded
    // per-frame retry. The guards below keep it from ever fighting the user.
    useEffect(() => {
        if (screen !== "chooser") return;

        let frameId = 0;
        let framesWaited = 0;

        const focusFirstField = () => {
            const host = firstFieldRef.current;
            // The ref points at the web component; its focus()/select() bottom out in the
            // inner <input> we must wait for anyway, so act on that directly.
            const inner = host?.shadowRoot?.querySelector("input") ?? null;
            // Re-read each frame: the user may start typing during the retry window.
            const shouldSelect = !projectNameTouchedRef.current;
            const valuePending = shouldSelect && !!inner && inner.value.length === 0;

            if ((!inner || valuePending) && framesWaited < PRESELECT_MAX_FRAMES) {
                framesWaited++;
                frameId = requestAnimationFrame(focusFirstField);
                return;
            }
            if (!inner) return;

            const activeElement = document.activeElement;
            const focusIsElsewhere =
                !!activeElement &&
                activeElement !== document.body &&
                activeElement !== document.documentElement &&
                activeElement !== host;
            if (focusIsElsewhere) return;

            inner.focus();
            if (shouldSelect) {
                inner.select();
            }
        };

        frameId = requestAnimationFrame(focusFirstField);
        return () => cancelAnimationFrame(frameId);
    }, [screen, preselectRequestId]);

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

    // List what the target project already contains, so the integration name below can
    // be flagged live when it collides. The project name/location are editable on this
    // same screen, so the target moves — re-list whenever it does (debounced to match
    // the path validation hook, which watches the same value). An existing project that
    // already holds an "Untitled" also shifts the default name to "Untitled_2".
    useEffect(() => {
        const targetPath = resolvedPath.trim();
        if (!targetPath || targetPath === takenNamesPathRef.current) {
            return;
        }
        let cancelled = false;
        const timer = setTimeout(async () => {
            let taken = emptyTakenNames();
            try {
                // A brand-new project has nothing to list; failing open just defers
                // collision reporting to the extension's own submit-time validation,
                // whereas keeping the previous project's list would reject names that
                // are actually free here.
                taken = toTakenNames(await wsClient.getProjectComponentNames({ projectPath: targetPath }));
            } catch (error) {
                console.error("Failed to list existing component names:", error);
            }
            if (cancelled) {
                return;
            }
            takenNamesPathRef.current = targetPath;
            setTakenNames(taken);
            if (!integrationNameTouchedRef.current) {
                setIntegrationName(
                    resolveDefaultNameAndDirectory(DEFAULT_INTEGRATION_NAME, taken, sanitizePackageName).name
                );
            }
        }, 300);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [wsClient, resolvedPath]);

    // Mirrors the project-name check above: clear a resolved error immediately, debounce
    // a new one so "required" doesn't flash on every keystroke. Keyed on the issue itself,
    // so a stale diagnostic also clears once the target project is re-listed.
    useEffect(() => {
        if (!integrationNameIssue) {
            debouncedSetIntegrationNameError.cancel();
            setIntegrationNameError(null);
            return;
        }
        debouncedSetIntegrationNameError(integrationNameIssue);
        return () => debouncedSetIntegrationNameError.cancel();
    }, [debouncedSetIntegrationNameError, integrationNameIssue]);

    useRealtimeProjectPathValidation({
        wsClient,
        projectPath: editablePath,
        projectName,
        // Validate as a component target (not a brand-new workspace) so an existing
        // project at the location is ALLOWED and reported via `existingWorkspace`
        // (add into it) rather than blocked.
        createAsWorkspace: false,
        pathTouched: pathTouched || (editablePath.trim().length > 0 && effectiveDirectoryName.length > 0),
        requiredPathMessage: "Please select a location for your project",
        invalidPathMessage: "Invalid project location",
        onPathErrorChange: useCallback((error: string | null) => setPathError(error), []),
        onExistingWorkspaceChange: useCallback((isWorkspace: boolean) => setExistingWorkspace(isWorkspace), []),
        directoryName: effectiveDirectoryName,
        allowExistingDirectory: true,
    });

    const handleNameChange = (value: string) => {
        projectNameTouchedRef.current = true;
        setProjectName(value);
        // Editing the name (re)couples the folder to it — so renaming a browsed
        // existing project retargets to a NEW project at <parent>/<derived-name>.
        dirCoupling.handleDisplayNameChange(value, { recouple: true });
    };

    const handlePathChange = (value: string) => {
        const { base, name } = splitPath(value);
        setPathTouched(true);
        setEditablePath(base);
        dirCoupling.handleDirectoryNameEdit(name, autoDirectoryName);
    };

    /**
     * Browse: the picked folder is the parent LOCATION, not the project folder. The
     * project keeps the name the user gave it and is targeted at `<picked>/<name>` —
     * whether something already lives there is reported live by the path validation
     * above, so nothing here needs to inspect the folder.
     */
    const handlePathSelection = async () => {
        try {
            const result = await wsClient.selectFileOrDirPath({ startPath: editablePath || defaultPath });
            if (!result.path) return;
            setEditablePath(result.path);
            setPathTouched(true);
            // Pin the name: the one-shot default-project lookup can still be in flight,
            // and its result no longer describes the location just picked.
            projectNameTouchedRef.current = true;
        } catch (error) {
            console.error("Failed to select path:", error);
            setPathError("Failed to select the project folder. Please try again.");
        }
    };

    const startingPointNoun = isLibrary ? "library" : "integration";

    /** The resolved project the integration / library is created into. */
    const projectContext: ProjectContext = {
        isNewProject: !existingWorkspace,
        workspacePath: resolvedPath,
        workspaceName: projectName.trim() || DEFAULT_PROJECT_NAME,
    };

    const canProceed =
        !projectNameError && !pathError && !!projectName.trim() && !!editablePath && !!effectiveDirectoryName;
    /** The integration route submits from this screen, so its name must be valid too. */
    const canCreateIntegration = canProceed && !integrationNameIssue;

    const handleIntegrationNameChange = (value: string) => {
        integrationNameTouchedRef.current = true;
        setIntegrationName(value);
    };

    const handleNext = () => {
        if (!canProceed || workspaceSupportPending) return;
        setScreen("library");
    };

    /**
     * Integration route: create the project and an EMPTY integration package inside it,
     * straight from this screen. The artifact-type/configure steps are skipped for now,
     * so no artifact is sent — the same payload the wizard's "Create Empty Integration"
     * used to submit. The extension reloads the window from here, so the form stays in
     * the creating state until it is torn down.
     */
    const handleCreateIntegration = async () => {
        if (!canCreateIntegration || workspaceSupportPending || isValidating || isCreating) return;
        setCreateError(null);
        setIsValidating(true);
        try {
            // Re-check the collision against a FRESH listing rather than trusting the live
            // one. The project name and location are edited on this same screen, so the
            // debounced `takenNames` can still describe the previous target when Create is
            // clicked — and the extension scaffolds over whatever sits at the resolved path
            // (`createBIProjectPure` writes Ballerina.toml/main.bal/... unconditionally), so
            // a stale pass here would blank an existing package's sources.
            let taken: TakenNames;
            try {
                taken = toTakenNames(await wsClient.getProjectComponentNames({ projectPath: resolvedPath }));
            } catch (error) {
                // Deliberately NOT failing open. A missing or unreadable target is already
                // reported as an EMPTY listing rather than a rejection — the extension
                // swallows the readdir failure and `readBallerinaProject` is existsSync-
                // guarded — so a rejection here is a genuine failure (transport, or an
                // unexpected throw), never "this project does not exist yet". Continuing
                // would scaffold over whatever is at the path without having verified it,
                // which is the exact outcome this whole block exists to prevent.
                console.error("Failed to re-check existing component names:", error);
                setCreateError("Could not verify the contents of the target project. Please try again.");
                return;
            }
            takenNamesPathRef.current = resolvedPath;
            setTakenNames(taken);
            const collision = resolveNameCollisionMessage(effectiveIntegrationName, taken, sanitizePackageName);
            if (collision) {
                setIntegrationNameError(collision);
                return;
            }

            setIsCreating(true);
            await biWsClient.createIntegration({
                project: {
                    integrationName: effectiveIntegrationName,
                    packageName: integrationPackageName,
                    projectPath: resolvedPath,
                    directoryName: integrationPackageName,
                    newProject: projectContext.isNewProject,
                    workspaceName: projectContext.workspaceName,
                },
            });
        } catch (error) {
            console.error("Failed to create the integration:", error);
            setIsCreating(false);
            // Lead with the operation, append the reason only when there is one — a bare
            // transport/filesystem message leaves the user to infer what failed. The raw
            // error is on the console above, which is where the detail is useful.
            const reason = error instanceof Error ? error.message : "";
            setCreateError(`Failed to create the integration.${reason ? ` ${reason}` : ""}`);
        } finally {
            setIsValidating(false);
        }
    };

    if (isCreating) {
        return (
            <CreateFlowShell title="Create">
                <CreatingSlot>
                    <CreatingIntegrationView
                        variant="create"
                        integrationName={effectiveIntegrationName}
                        projectName={projectContext.workspaceName}
                        isNewProject={projectContext.isNewProject}
                    />
                </CreatingSlot>
            </CreateFlowShell>
        );
    }

    if (screen === "library") {
        return (
            <CreateFlowShell
                title="New Library"
                subtitle={`In project ${projectName.trim() || DEFAULT_PROJECT_NAME}`}
                onBack={() => setScreen("chooser")}
            >
                <LibraryCreationView embedded projectContext={projectContext} ballerinaUnavailable={ballerinaUnavailable} />
            </CreateFlowShell>
        );
    }

    return (
        <CreateFlowShell
            title="Create"
            subtitle="A project helps you organize your integrations and libraries."
            onBack={onBack}
        >
            <Section>
                {/* Both fields live inside one bordered box so the status footer below
                    reads as derived from the pair, not from whichever field it happens
                    to sit nearest. */}
                <ProjectGroupContainer>
                    <ProjectGroupFields>
                        <FieldGroup>
                            <TextField
                                ref={firstFieldRef}
                                onTextChange={handleNameChange}
                                value={projectName}
                                label="Project name"
                                placeholder="Enter a project name"
                                required={true}
                                errorMsg={projectNameError || ""}
                            />
                        </FieldGroup>

                        <FieldGroup>
                            <DirectorySelector
                                id="project-location-selector"
                                label="Location"
                                placeholder="Browse to select a location..."
                                selectedPath={resolvedPath}
                                required={true}
                                onSelect={handlePathSelection}
                                onChange={handlePathChange}
                                errorMsg={pathError || undefined}
                            />
                        </FieldGroup>
                    </ProjectGroupFields>

                    {!pathError && resolvedPath && (
                        <ProjectStatusStrip isWarning={existingWorkspace}>
                            <Icon
                                name={existingWorkspace ? "warning" : "new-folder"}
                                isCodicon
                                sx={STATUS_ICON_SX}
                                iconSx={existingWorkspace ? STATUS_ICON_WARNING_GLYPH_SX : STATUS_ICON_GLYPH_SX}
                            />
                            <span>
                                <ProjectStatusLead isWarning={existingWorkspace}>
                                    {existingWorkspace ? "Existing project" : "New project"}
                                </ProjectStatusLead>
                                {existingWorkspace
                                    ? <> · your new {startingPointNoun} will be added here</>
                                    : <> · will be created here</>}
                            </span>
                        </ProjectStatusStrip>
                    )}
                </ProjectGroupContainer>
            </Section>

            <Section>
                <ProjectTypeSelector
                    label="Choose your starting point"
                    value={isLibrary}
                    onChange={setIsLibrary}
                    note="This is just your starting point. You can add more integrations and libraries to the project later."
                />
            </Section>

            {/* The integration is named here rather than on a step of its own — the
                wizard is bypassed, so this screen submits. The library route keeps its
                own form, which already collects a name alongside its package details. */}
            {!isLibrary && (
                <Section>
                    <FieldGroup>
                        <TextField
                            onTextChange={handleIntegrationNameChange}
                            value={integrationName}
                            label="Integration name"
                            placeholder="Enter an integration name"
                            required={true}
                            errorMsg={integrationNameError || ""}
                        />
                    </FieldGroup>
                </Section>
            )}

            {createError && (
                <FormError>
                    <Icon name="error" isCodicon sx={{ marginTop: "1px" }} />
                    <span>{createError}</span>
                </FormError>
            )}

            <FormFooter>
                <span
                    title={
                        ballerinaUnavailable
                            ? "Ballerina distribution is not set up. Use Configure to set it up."
                            : workspaceSupportPending
                                ? "Finishing start-up…"
                                : undefined
                    }
                >
                    <Button
                        disabled={
                            ballerinaUnavailable ||
                            workspaceSupportPending ||
                            isValidating ||
                            (isLibrary ? !canProceed : !canCreateIntegration)
                        }
                        onClick={isLibrary ? handleNext : handleCreateIntegration}
                        appearance="primary"
                    >
                        {isLibrary ? "Next" : isValidating ? "Validating..." : "Create Integration"}
                    </Button>
                </span>
            </FormFooter>
        </CreateFlowShell>
    );
}

export default CreateProjectChooser;
