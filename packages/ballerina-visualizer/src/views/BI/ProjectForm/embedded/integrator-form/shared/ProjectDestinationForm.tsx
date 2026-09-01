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

import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import debounce from "lodash/debounce";
import styled from "@emotion/styled";
import { Button, DirectorySelector, Icon, TextField } from "@wso2/ui-toolkit";
import { useBrowsePick, BrowsePickClient } from "../useBrowsePick";
import {
    joinPath,
    splitPath,
    sanitizePackageName,
    sanitizeOrgHandle,
    validateComponentName,
    validateOrgName,
    validatePackageName,
    validateProjectName,
} from "../utils";
import { AdvancedConfigurationSection, Organization } from "../components";
import {
    useRealtimeProjectPathValidation,
    ProjectPathValidationClient,
} from "../useRealtimeProjectPathValidation";
import { FieldGroup, ProjectSectionContainer, SectionDivider } from "../styles";
import { DEFAULT_INTEGRATION_NAME, DEFAULT_PROJECT_NAME } from "../types";
import { FormFooter } from "./FormPageLayout";
import { useDirectoryNameCoupling } from "../../../hooks/useDirectoryNameCoupling";
import {
    checkNameCollision as resolveNameCollisionMessage,
    resolveDefaultNameAndDirectory,
    toTakenNames,
    emptyTakenNames,
    TakenNames,
} from "../../../hooks/resolveAvailableDirectoryName";
import { ProjectTypeSelector } from "../../../components";
import { ProjectContext } from "../../../../CreateIntegrationWizard/types";

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
 *  not an error — it is a legal target — but it silently changes what the submit does,
 *  so it is toned as a warning rather than as neutral info. The duplicate `background`
 *  is a fallback for runtimes without `color-mix()` (Chromium < 111). */
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

/** Form-level failure from the submit itself — the fields are all valid at
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

/** Buttons sit right-aligned; a secondary action leads the primary one. */
const FooterActions = styled.div`
    display: flex;
    gap: 8px;
    align-items: center;
`;

/**
 * Everything this form needs from its transport. Declared structurally so both the
 * embedded `WiBridgeClient` (new-project flow) and the WS-manager `BiWsClient`
 * (migration wizard) satisfy it without either having to know about the other.
 */
export interface ProjectDestinationClient extends BrowsePickClient, ProjectPathValidationClient {
    getWorkspaceRoot(): Promise<{ path?: string }>;
    getDefaultCreationPath(): Promise<{ path?: string }>;
    getDefaultOrgName(): Promise<{ orgName: string }>;
    getProjectComponentNames(payload: { projectPath: string }): Promise<{ folders: string[]; titles: string[] }>;
}

/** The resolved destination, once every field has passed validation. */
export interface ProjectDestinationValues {
    /** Display name (title) of the project the package lands in. */
    projectName: string;
    /** The parent directory the project folder sits in. */
    location: string;
    /** Folder name of the project itself — the last segment of the path field. */
    directoryName: string;
    /** Absolute path of the project itself: `<location>/<directoryName>`. */
    projectPath: string;
    /** False when `projectPath` already holds a project — the package is added into it. */
    newProject: boolean;
    /** True when the starting point is a library rather than an integration. */
    isLibrary: boolean;
    /** Display name (title) of the artifact. Empty when `collectArtifact` is false. */
    integrationName: string;
    /** Ballerina package name for the artifact. Empty when `collectArtifact` is false. */
    packageName: string;
    /**
     * Folder for the artifact package inside the project. Derived from the artifact's
     * DISPLAY name and so independent of `packageName`, which the user can override in
     * Advanced Configurations. Empty when `collectArtifact` is false.
     */
    artifactDirectoryName: string;
    orgName: string;
    orgHandle: string;
    version: string;
}

export interface ProjectDestinationFormProps {
    wsClient: ProjectDestinationClient;
    /** Populates the organization picker; a free-text field with a sign-in hint without it. */
    organizations?: Organization[];
    /**
     * Ask for the artifact's own name and package name. Turn it off for a destination
     * that receives several packages at once (the migration wizard's multi-project
     * import), where only the project and the shared org/version are the user's to pick.
     */
    collectArtifact?: boolean;
    /** Show the Integration / Library starting-point selector. */
    showStartingPoint?: boolean;
    /** Replaces the artifact fields and footer while the library starting point is chosen. */
    renderLibraryRoute?: (context: { projectContext: ProjectContext; canProceed: boolean }) => ReactNode;
    /** Noun used in the status strip's trailing clause. */
    artifactNoun?: string;
    /** Primary button label at rest. */
    submitLabel: string;
    /** Primary button label while `onSubmit` is in flight. Defaults to `submitLabel`. */
    submittingLabel?: string;
    /** Leads the message shown when `onSubmit` rejects. */
    submitErrorPrefix?: string;
    /** Extra gate on the primary button, beyond field validity. */
    submitDisabled?: boolean;
    /** Tooltip explaining `submitDisabled`. */
    submitDisabledTooltip?: string;
    /** Rendered to the left of the primary button. */
    secondaryButton?: { text: string; onClick: () => void; disabled?: boolean };
    onSubmit: (values: ProjectDestinationValues) => Promise<void> | void;
}

/**
 * The project-destination form shared by the Create flow and the migration wizard's
 * Configure Destination step: which project the artifact lands in (name + location, with
 * existing-vs-new detected live), optionally the starting point, the artifact's own name,
 * and its package details.
 *
 * Owns every field, its validation, and the submit-time collision re-check — but not the
 * action itself. The host supplies `onSubmit` and the button label, so the same screen can
 * create an integration outright or hand the destination to a migration.
 */
export function ProjectDestinationForm({
    wsClient,
    organizations,
    collectArtifact = true,
    showStartingPoint = false,
    renderLibraryRoute,
    artifactNoun,
    submitLabel,
    submittingLabel,
    submitErrorPrefix = "Failed to continue.",
    submitDisabled,
    submitDisabledTooltip,
    secondaryButton,
    onSubmit,
}: ProjectDestinationFormProps) {
    const firstFieldRef = useRef<HTMLInputElement>(null);
    const defaultPathInitialized = useRef(false);
    const orgNameInitialized = useRef(false);
    const projectNameTouchedRef = useRef(false);
    // Set the moment the user edits the integration name, so the async default-name
    // indexing below never clobbers what they typed.
    const integrationNameTouchedRef = useRef(false);
    // The location `takenNames` currently describes, so the refresh effect below can
    // skip a path it has already listed (and re-list whenever the project retargets).
    const takenNamesPathRef = useRef<string | null>(null);

    const [isLibrary, setIsLibrary] = useState(false);

    const [integrationName, setIntegrationName] = useState(DEFAULT_INTEGRATION_NAME);
    const [integrationNameError, setIntegrationNameError] = useState<string | null>(null);
    const [packageName, setPackageName] = useState("");
    const [orgName, setOrgName] = useState("");
    const [version, setVersion] = useState("");
    const [isPackageInfoExpanded, setIsPackageInfoExpanded] = useState(false);
    // Folders/titles already used in the target project, for live collision flagging.
    const [takenNames, setTakenNames] = useState<TakenNames>(emptyTakenNames());
    // Submit-time re-check of the collision list, before anything is created.
    const [isValidating, setIsValidating] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);

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

    // Owns the Browse interaction and the name/folder memory that makes a pick reversible.
    const browsePick = useBrowsePick({
        wsClient,
        dirCoupling,
        projectName,
        setProjectName,
        projectNameTouchedRef,
        setEditablePath,
        setPathTouched,
        setPathError,
        startPath: editablePath || defaultPath,
        // This screen's name field labels the project the artifact lands in, so it shows
        // an existing project's own title rather than a name to create.
        adoptProjectName: true,
        selectFailedMessage: "Failed to select the project folder. Please try again.",
    });

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

    // The artifact package created inside the project. Its folder and its Ballerina
    // package name are both derived from the name — unlike the wizard there is no
    // editable path field here, since the location is already resolved above.
    const effectiveIntegrationName = integrationName.trim() || DEFAULT_INTEGRATION_NAME;
    const integrationPackageName = sanitizePackageName(effectiveIntegrationName) || "untitled";
    const effectivePackageName = packageName || integrationPackageName;
    // Resolved synchronously — the displayed diagnostic is debounced, so gating submit on
    // the error state alone would leave it clickable for a beat after a bad edit.
    const integrationNameIssue = collectArtifact
        ? validateComponentName(integrationName) ||
          resolveNameCollisionMessage(integrationName, takenNames, sanitizePackageName)
        : null;
    const packageNameError = collectArtifact
        ? validatePackageName(effectivePackageName, effectiveIntegrationName)
        : null;
    const orgNameError = validateOrgName(orgName);

    // Initialize org name independently of workspace readiness — mirrors the library route.
    useEffect(() => {
        if (orgNameInitialized.current) return;
        orgNameInitialized.current = true;
        if (organizations && organizations.length > 0) {
            setOrgName(organizations[0].handle);
        } else {
            wsClient.getDefaultOrgName()
                .then(({ orgName: defaultOrgName }) => setOrgName(defaultOrgName))
                .catch((error) => console.error("Failed to fetch default org name:", error));
        }
    }, [organizations, wsClient]);

    // Seed the Default project location once (`<defaultLocation>/default`). The
    // realtime validation then reports whether it already exists (add into it) or
    // is new (created on submit).
    useEffect(() => {
        let mounted = true;
        (async () => {
            if (defaultPathInitialized.current) return;
            try {
                // Re-checked before EVERY write below, not just once: this seed spans
                // several round-trips, and a Browse that lands mid-flight has already
                // retargeted the form — applying any part of a reading taken for the
                // default location would drag it back, which is the very bug being fixed.
                const superseded = () => !mounted || browsePick.pathPickedRef.current;
                const { path: workspacePath } = await wsClient.getWorkspaceRoot();
                if (superseded()) return;
                const dp = workspacePath || (await wsClient.getDefaultCreationPath()).path;
                if (superseded()) return;
                defaultPathInitialized.current = true;
                setDefaultPath(dp);
                setEditablePath(dp);

                // If the default project already exists, show its real name (from its
                // Ballerina.toml) instead of the "Default" placeholder — matching what
                // Browse does. The folder stays "default"; only the display name changes.
                const defaultProjectPath = joinPath(dp, directoryName);
                const info = await wsClient.getExistingProjectInfo({ projectPath: defaultProjectPath });
                if (superseded()) return;
                if (info?.isProject && info.name && !projectNameTouchedRef.current) {
                    setProjectName(info.name);
                    dirCoupling.setDirTouched(true);
                    // Same memory a Browse pick records: this name and folder are the
                    // seeded project's, so browsing elsewhere restores the placeholder
                    // instead of carrying them to the new location.
                    browsePick.recordSeededAdoption({ name: DEFAULT_PROJECT_NAME, touched: false }, directoryName);
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

    // Focus + select the Project name field on every arrival. A bare setTimeout(0)+select()
    // fails twice over: (1) the async seed above can replace the name afterwards, and
    // re-assigning the web component's value collapses the selection — `preselectRequestId`
    // re-runs this; (2) the real <input> lives in `vscode-text-field`'s shadow root and may
    // not be attached yet, hence the bounded per-frame retry. The guards below keep it from
    // ever fighting the user.
    useEffect(() => {
        if (isLibrary) return;

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
    }, [isLibrary, preselectRequestId]);

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

    // List what the target project already contains, so the artifact name below can be
    // flagged live when it collides. The project name/location are editable on this same
    // screen, so the target moves — re-list whenever it does (debounced to match the path
    // validation hook, which watches the same value). An existing project that already
    // holds an "Untitled" also shifts the default name to "Untitled_2".
    useEffect(() => {
        if (!collectArtifact) {
            return;
        }
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
    }, [collectArtifact, wsClient, resolvedPath]);

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
        // Both the name and (via the recouple) the folder are the user's now, so a later
        // Browse has nothing of the previous pick's left to undo.
        browsePick.releaseName();
    };

    const handlePathChange = (value: string) => {
        const { base, name } = splitPath(value);
        setPathTouched(true);
        setEditablePath(base);
        dirCoupling.handleDirectoryNameEdit(name, autoDirectoryName);
        // Only an edit to the SEGMENT claims it from a pick — retyping the parent portion
        // leaves the pinned folder exactly as the pick left it. Any adopted NAME is still
        // the pick's either way, so that memory stands.
        browsePick.releaseFolderIfSegmentEdited(name);
    };

    /**
     * Browse: the picked folder is normally the parent LOCATION, with the project targeted
     * at `<picked>/<name-derived folder>`. Picking a folder that is ITSELF a project is the
     * exception — appending a folder inside it would target `<project>/default`, which is
     * neither the project the user pointed at nor a valid place for a new one (a project
     * inside a project). The pick is taken as the project itself instead: its real name
     * fills the name field and its own folder becomes the path's last segment, which is
     * exactly what typing that same path into the field already does. Whether the resolved
     * target exists is reported live by the path validation above.
     */
    const handlePathSelection = browsePick.selectPath;

    const startingPointNoun = artifactNoun ?? (isLibrary ? "library" : "integration");

    /** The resolved project the artifact is created into. */
    const projectContext: ProjectContext = {
        isNewProject: !existingWorkspace,
        workspacePath: resolvedPath,
        workspaceName: projectName.trim() || DEFAULT_PROJECT_NAME,
    };

    const canProceed =
        !projectNameError && !pathError && !!projectName.trim() && !!editablePath && !!effectiveDirectoryName;
    /** Submitting from this screen also requires the artifact fields to be valid. */
    const canSubmit = canProceed && !integrationNameIssue && !packageNameError && !orgNameError;

    const handleIntegrationNameChange = (value: string) => {
        integrationNameTouchedRef.current = true;
        setIntegrationName(value);
    };

    const handleSubmit = async () => {
        if (!canSubmit || submitDisabled || isValidating || isSubmitting) return;
        setSubmitError(null);
        setIsValidating(true);
        try {
            if (collectArtifact) {
                // Re-check the collision against a FRESH listing rather than trusting the
                // live one. The project name and location are edited on this same screen,
                // so the debounced `takenNames` can still describe the previous target when
                // submit is clicked — and the extension scaffolds over whatever sits at the
                // resolved path, so a stale pass here would blank an existing package's
                // sources.
                let taken: TakenNames;
                try {
                    taken = toTakenNames(await wsClient.getProjectComponentNames({ projectPath: resolvedPath }));
                } catch (error) {
                    // Deliberately NOT failing open. A missing or unreadable target is
                    // already reported as an EMPTY listing rather than a rejection — the
                    // extension swallows the readdir failure and `readBallerinaProject` is
                    // existsSync-guarded — so a rejection here is a genuine failure
                    // (transport, or an unexpected throw), never "this project does not
                    // exist yet". Continuing would scaffold over whatever is at the path
                    // without having verified it, which is what this block exists to prevent.
                    console.error("Failed to re-check existing component names:", error);
                    setSubmitError("Could not verify the contents of the target project. Please try again.");
                    return;
                }
                takenNamesPathRef.current = resolvedPath;
                setTakenNames(taken);
                const collision = resolveNameCollisionMessage(effectiveIntegrationName, taken, sanitizePackageName);
                if (collision) {
                    setIntegrationNameError(collision);
                    return;
                }
            }

            setIsSubmitting(true);
            const orgHandle = organizations?.find(o => o.handle === orgName)?.handle || sanitizeOrgHandle(orgName);
            await onSubmit({
                projectName: projectContext.workspaceName,
                location: editablePath,
                directoryName: effectiveDirectoryName,
                projectPath: resolvedPath,
                newProject: projectContext.isNewProject,
                isLibrary,
                integrationName: collectArtifact ? effectiveIntegrationName : "",
                packageName: collectArtifact ? effectivePackageName : "",
                artifactDirectoryName: collectArtifact ? integrationPackageName : "",
                orgName,
                orgHandle,
                version,
            });
        } catch (error) {
            console.error("Project destination submit failed:", error);
            setIsSubmitting(false);
            // Lead with the operation, append the reason only when there is one — a bare
            // transport/filesystem message leaves the user to infer what failed. The raw
            // error is on the console above, which is where the detail is useful.
            const reason = error instanceof Error ? error.message : "";
            setSubmitError(`${submitErrorPrefix}${reason ? ` ${reason}` : ""}`);
        } finally {
            setIsValidating(false);
        }
    };

    const showLibraryRoute = showStartingPoint && isLibrary && !!renderLibraryRoute;

    return (
        <>
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
                                    ? <> · your {startingPointNoun} will be added here</>
                                    : <> · will be created here</>}
                            </span>
                        </ProjectStatusStrip>
                    )}
                </ProjectGroupContainer>
            </Section>

            {showStartingPoint && (
                <Section>
                    <ProjectTypeSelector
                        label="Choose your starting point"
                        value={isLibrary}
                        onChange={setIsLibrary}
                        note="This is just your starting point. You can add more integrations and libraries to the project later."
                    />
                </Section>
            )}

            {showLibraryRoute ? (
                <Section>{renderLibraryRoute!({ projectContext, canProceed })}</Section>
            ) : (
                <>
                    <Section>
                        {collectArtifact && (
                            <>
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

                                <SectionDivider />
                            </>
                        )}

                        <AdvancedConfigurationSection
                            isExpanded={isPackageInfoExpanded}
                            onToggle={() => setIsPackageInfoExpanded(!isPackageInfoExpanded)}
                            data={{ packageName: effectivePackageName, orgName, version }}
                            onChange={(data) => {
                                if (data.packageName !== undefined) setPackageName(data.packageName);
                                if (data.orgName !== undefined) setOrgName(data.orgName);
                                if (data.version !== undefined) setVersion(data.version);
                            }}
                            isLibrary={false}
                            hidePackageName={!collectArtifact}
                            packageNameError={packageNameError}
                            orgNameError={orgNameError}
                            organizations={organizations}
                            hasError={!!(packageNameError || orgNameError)}
                        />
                    </Section>

                    {submitError && (
                        <FormError>
                            <Icon name="error" isCodicon sx={{ marginTop: "1px" }} />
                            <span>{submitError}</span>
                        </FormError>
                    )}

                    <FormFooter>
                        <FooterActions>
                            {secondaryButton && (
                                <Button
                                    appearance="secondary"
                                    onClick={secondaryButton.onClick}
                                    disabled={secondaryButton.disabled || isSubmitting}
                                >
                                    {secondaryButton.text}
                                </Button>
                            )}
                            <span title={submitDisabled ? submitDisabledTooltip : undefined}>
                                <Button
                                    disabled={submitDisabled || isValidating || isSubmitting || !canSubmit}
                                    onClick={handleSubmit}
                                    appearance="primary"
                                >
                                    {isSubmitting
                                        ? (submittingLabel ?? submitLabel)
                                        : isValidating ? "Validating..." : submitLabel}
                                </Button>
                            </span>
                        </FooterActions>
                    </FormFooter>
                </>
            )}
        </>
    );
}

export default ProjectDestinationForm;
