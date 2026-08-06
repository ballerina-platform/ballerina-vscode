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
    validateProjectName,
} from "./utils";
import { useRealtimeProjectPathValidation } from "./useRealtimeProjectPathValidation";
import { FieldGroup, ProjectSectionContainer } from "./styles";
import { DEFAULT_PROJECT_NAME } from "./types";
import { CreateFlowShell } from "./shared/CreateFlowShell";
import { FormFooter } from "./shared/FormPageLayout";
import { useDirectoryNameCoupling } from "../../hooks/useDirectoryNameCoupling";
import { LibraryCreationView } from "./LibraryCreationView";
import { ProjectTypeSelector } from "../../components";
import { CreateIntegrationWizard } from "../../../CreateIntegrationWizard";
import { ProjectContext } from "../../../CreateIntegrationWizard/types";
import { useAgentBuilderMode } from "../../../CreateIntegrationWizard/hooks/useAgentBuilderMode";
import { BiWsClient } from "../../../wsManager/WsClient";
import { BiWsClientProvider } from "../../../wsManager/WsClientContext";

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
 *  which the starting-point section below already uses. The duplicate `background` is
 *  a fallback for runtimes without `color-mix()` (Chromium < 111). */
const ProjectStatusStrip = styled.div`
    display: flex;
    align-items: flex-start;
    gap: 6px;
    padding: 8px 12px;
    font-size: 12px;
    line-height: 1.4;
    color: var(--vscode-descriptionForeground);
    background: var(--vscode-inputValidation-infoBackground, var(--vscode-sideBar-background));
    background: color-mix(in srgb, var(--vscode-textLink-foreground) 12%, var(--vscode-editor-background));
    border-top: 1px solid var(--vscode-panel-border);
`;

/** The scannable half of the status ("New project" / "Existing project"),
 *  lifted above the trailing detail clause so the key distinction registers at
 *  a glance without resorting to a louder color. */
const ProjectStatusLead = styled.span`
    color: var(--vscode-foreground);
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

/** Frame budget for the Project name preselect retry (~0.5s at 60fps). Only a
 *  backstop: the field is normally ready within a frame or two, and this just
 *  guarantees a mount that never satisfies the readiness check still ends up
 *  focused instead of retrying forever. */
const PRESELECT_MAX_FRAMES = 30;

/** Which screen of the Create flow is showing. */
type Screen = "chooser" | "integration" | "library";

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
 * library), then route to the integration wizard or the library form in the same shell.
 * The Default project is pre-selected; existing vs new is detected live and shown under
 * the location field.
 */
export function CreateProjectChooser({
    biWsClient,
    ballerinaUnavailable,
    workspaceSupportPending,
    onBack,
}: CreateProjectChooserProps) {
    const { wsClient } = useVisualizerContext();
    const agentBuilderMode = useAgentBuilderMode(biWsClient);
    const firstFieldRef = useRef<HTMLInputElement>(null);
    const defaultPathInitialized = useRef(false);
    const projectNameTouchedRef = useRef(false);

    const [screen, setScreen] = useState<Screen>("chooser");
    const [isLibrary, setIsLibrary] = useState(false);

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

    const autoDirectoryName = projectName.trim() ? sanitizePackageName(projectName) : "";
    const effectiveDirectoryName = dirTouched ? directoryName.trim() : (directoryName.trim() || autoDirectoryName);
    const resolvedPath = editablePath ? joinPath(editablePath, effectiveDirectoryName) : "";

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
     * Browse: the picked folder IS the project location. An existing project is used as-is
     * (with its real name); otherwise it becomes a new project there.
     */
    const handlePathSelection = async () => {
        try {
            const result = await wsClient.selectFileOrDirPath({ startPath: resolvedPath || editablePath || defaultPath });
            if (!result.path) return;
            const { base, name: folderName } = splitPath(result.path);
            const info = await wsClient.getExistingProjectInfo({ projectPath: result.path });
            projectNameTouchedRef.current = true;
            setEditablePath(base);
            dirCoupling.setDirectoryName(folderName);
            setProjectName(info?.isProject ? (info.name || folderName) : folderName);
            dirCoupling.setDirTouched(true);
            setPathTouched(true);
        } catch (error) {
            console.error("Failed to select path:", error);
            setPathError("Failed to select the project folder. Please try again.");
        }
    };

    const startingPointNoun = isLibrary ? "library" : "integration";

    /** The resolved project the wizard / library form creates the artifact into. */
    const projectContext: ProjectContext = {
        isNewProject: !existingWorkspace,
        workspacePath: resolvedPath,
        workspaceName: projectName.trim() || DEFAULT_PROJECT_NAME,
    };

    const canProceed =
        !projectNameError && !pathError && !!projectName.trim() && !!editablePath && !!effectiveDirectoryName;

    const handleNext = () => {
        if (!canProceed || workspaceSupportPending) return;
        setScreen(isLibrary ? "library" : "integration");
    };

    if (screen === "integration") {
        return (
            <CreateFlowShell
                title="New Integration"
                subtitle={`In project ${projectName.trim() || DEFAULT_PROJECT_NAME}`}
                onBack={() => setScreen("chooser")}
                bodyFill
            >
                <BiWsClientProvider wsClient={biWsClient} onBack={onBack}>
                    <CreateIntegrationWizard embedded showHeader={false} projectContext={projectContext} />
                </BiWsClientProvider>
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
            subtitle={
                agentBuilderMode
                    ? "A project helps you organize your agents."
                    : "A project helps you organize your integrations and libraries."
            }
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
                        <ProjectStatusStrip>
                            <Icon
                                name={existingWorkspace ? "info" : "new-folder"}
                                isCodicon
                                sx={STATUS_ICON_SX}
                                iconSx={STATUS_ICON_GLYPH_SX}
                            />
                            <span>
                                <ProjectStatusLead>
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
            
            {agentBuilderMode === false && (
                <Section>
                    <ProjectTypeSelector
                        label="Choose your starting point"
                        value={isLibrary}
                        onChange={setIsLibrary}
                        note="This is just your starting point. You can add more integrations and libraries to the project later."
                    />
                </Section>
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
                        disabled={ballerinaUnavailable || workspaceSupportPending || !canProceed}
                        onClick={handleNext}
                        appearance="primary"
                    >
                        Next
                    </Button>
                </span>
            </FormFooter>
        </CreateFlowShell>
    );
}

export default CreateProjectChooser;
