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

import { MutableRefObject, useCallback, useRef } from "react";
import { DirectoryNameCoupling } from "../../hooks/useDirectoryNameCoupling";
import { applyBrowsePick, BrowsePickState } from "./utils";

/**
 * Minimal structural contract for the client a Browse needs. Both the embedded
 * WiBridgeClient and the wizard's client satisfy it.
 */
export interface BrowsePickClient {
    selectFileOrDirPath(payload: { startPath?: string }): Promise<{ path?: string }>;
    getExistingProjectInfo(payload: { projectPath: string }): Promise<{ isProject?: boolean; name?: string } | null>;
}

export interface UseBrowsePickOptions {
    wsClient: BrowsePickClient;
    dirCoupling: DirectoryNameCoupling;
    /** Current Project-name field value. */
    projectName: string;
    setProjectName: (name: string) => void;
    /** Owned by the view; set when the USER edits the name field. */
    projectNameTouchedRef: MutableRefObject<boolean>;
    setEditablePath: (path: string) => void;
    setPathTouched: (touched: boolean) => void;
    setPathError: (error: string | null) => void;
    /** Where the folder dialog opens. */
    startPath: string;
    /**
     * Whether the Project-name field names the project being ADDED TO (so it takes on an
     * existing project's own title) rather than a new project the user is naming.
     */
    adoptProjectName?: boolean;
    selectFailedMessage: string;
}

export interface BrowsePick {
    /** Browse button handler. */
    selectPath: () => Promise<void>;
    /**
     * True once a pick has resolved. A one-shot default-path seed must check this before
     * EVERY state write it makes — it runs across several awaits, and a pick that lands
     * mid-flight leaves its findings describing a location the user has already left.
     */
    pathPickedRef: MutableRefObject<boolean>;
    /** Records a name/folder a default-path seed adopted, so a later pick can undo it. */
    recordSeededAdoption: (displaced: { name: string; touched: boolean }, directoryName: string) => void;
    /**
     * The user typed a name: it and the folder are theirs now. Returns whether a pick's
     * hold on the folder was actually released, so a caller that coupled the folder in the
     * same breath knows whether it has to recouple.
     */
    releaseName: () => boolean;
    /**
     * The path field was edited. Releases a pick's hold on the last segment only when that
     * segment actually changed — retyping the PARENT portion leaves the pinned folder in
     * place, and must not look like the user claiming it.
     */
    releaseFolderIfSegmentEdited: (editedDirectoryName: string) => void;
}

/**
 * Owns the Browse interaction for the project-creation forms: the folder dialog, the
 * existing-project inspection, and the name/folder memory that makes a pick reversible
 * (see {@link applyBrowsePick}).
 *
 * Both forms drive the same sequence and differ only in `adoptProjectName` and the error
 * text, so the ordering hazards below are handled once rather than in each copy.
 */
export function useBrowsePick({
    wsClient,
    dirCoupling,
    projectName,
    setProjectName,
    projectNameTouchedRef,
    setEditablePath,
    setPathTouched,
    setPathError,
    startPath,
    adoptProjectName,
    selectFailedMessage,
}: UseBrowsePickOptions): BrowsePick {
    const displacedNameRef = useRef<BrowsePickState["displacedName"]>(null);
    const folderPinnedByPickRef = useRef(false);
    /** The segment a pick pinned, so a path edit can tell an edit OF it from an edit AROUND it. */
    const pinnedDirectoryNameRef = useRef<string | null>(null);
    const pathPickedRef = useRef(false);
    /** Latest pick wins: an earlier, slower inspection must not write over a later one. */
    const pickRequestIdRef = useRef(0);

    // The name is read back AFTER an await, and the webview stays interactive across it —
    // so it has to come from a ref. Reading the render closure instead would write the
    // pre-await value back over anything the user typed while the folder was inspected.
    const projectNameRef = useRef(projectName);
    projectNameRef.current = projectName;

    const recordSeededAdoption = useCallback(
        (displaced: { name: string; touched: boolean }, directoryName: string) => {
            displacedNameRef.current = displaced;
            folderPinnedByPickRef.current = true;
            pinnedDirectoryNameRef.current = directoryName;
        },
        []
    );

    const releaseName = useCallback(() => {
        const wasPinned = folderPinnedByPickRef.current;
        displacedNameRef.current = null;
        folderPinnedByPickRef.current = false;
        pinnedDirectoryNameRef.current = null;
        return wasPinned;
    }, []);

    const releaseFolderIfSegmentEdited = useCallback((editedDirectoryName: string) => {
        const pinned = pinnedDirectoryNameRef.current;
        if (pinned === null || editedDirectoryName === pinned) {
            return;
        }
        folderPinnedByPickRef.current = false;
        pinnedDirectoryNameRef.current = null;
    }, []);

    const selectPath = useCallback(async () => {
        try {
            const result = await wsClient.selectFileOrDirPath({ startPath });
            if (!result.path) return;
            setPathTouched(true);
            pathPickedRef.current = true;

            // Deliberately NOT written optimistically before the inspection below. The
            // field renders `<base>/<segment>`, so writing the pick early would compose it
            // with the PREVIOUS segment and flash exactly the wrong target this whole flow
            // exists to prevent. The lag it would hide needs the inspection to hang while
            // the dialog that just returned over the same transport did not — and the stat
            // is local, so it resolves in the same breath the picker did.
            const requestId = ++pickRequestIdRef.current;
            // Best effort — an unreadable folder simply keeps the parent-location reading.
            const info = await wsClient
                .getExistingProjectInfo({ projectPath: result.path })
                .catch((error: unknown): null => {
                    console.error("Failed to inspect the selected folder:", error);
                    return null;
                });
            // A newer Browse resolved while this one was inspecting; its reading is current,
            // and the state below would describe a location the user has already left.
            if (requestId !== pickRequestIdRef.current) return;

            const next = applyBrowsePick(
                result.path,
                info,
                {
                    projectName: projectNameRef.current,
                    projectNameTouched: projectNameTouchedRef.current,
                    displacedName: displacedNameRef.current,
                    folderPinnedByPick: folderPinnedByPickRef.current,
                },
                { adoptProjectName }
            );

            setEditablePath(next.base);
            if (next.folder.action === "pin") {
                // Hold the project's OWN folder rather than re-deriving it from the name:
                // a project's title and its directory need not match.
                dirCoupling.setDirectoryName(next.folder.directoryName);
                dirCoupling.setDirTouched(true);
                pinnedDirectoryNameRef.current = next.folder.directoryName;
            } else if (next.folder.action === "recouple") {
                dirCoupling.handleDisplayNameChange(next.folder.displayName, { recouple: true });
                pinnedDirectoryNameRef.current = null;
            }
            setProjectName(next.projectName);
            projectNameTouchedRef.current = next.projectNameTouched;
            displacedNameRef.current = next.displacedName;
            folderPinnedByPickRef.current = next.folderPinnedByPick;
        } catch (error) {
            console.error("Failed to select path:", error);
            setPathError(selectFailedMessage);
        }
    }, [
        adoptProjectName,
        dirCoupling,
        projectNameTouchedRef,
        selectFailedMessage,
        setEditablePath,
        setPathError,
        setPathTouched,
        setProjectName,
        startPath,
        wsClient,
    ]);

    return { selectPath, pathPickedRef, recordSeededAdoption, releaseName, releaseFolderIfSegmentEdited };
}
