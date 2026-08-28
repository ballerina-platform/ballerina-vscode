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

import { applyBrowsePick, BrowsePickState, joinPath, resolveBrowsePick, sanitizePackageName } from "./utils";

/**
 * How a Create form composes its target from a resolved pick: the segment the pick
 * pinned, or (when it pinned none) one derived from the project name. Mirrors
 * `effectiveDirectoryName` / `resolvedPath` in the project-creation views, so the
 * assertions below describe the path those forms actually submit.
 */
const targetPath = (pick: ReturnType<typeof resolveBrowsePick>, projectName: string): string =>
    joinPath(pick.base, pick.directoryName ?? sanitizePackageName(projectName));

describe("resolveBrowsePick", () => {
    describe("a folder that is not a project", () => {
        it("is the parent location, leaving the folder name-derived", () => {
            const pick = resolveBrowsePick("/Users/me/code", { isProject: false });

            expect(pick).toEqual({ base: "/Users/me/code" });
            expect(targetPath(pick, "My Project")).toBe("/Users/me/code/my_project");
        });

        it("keeps that reading when the folder could not be inspected", () => {
            const uninspectable: (null | undefined)[] = [null, undefined];
            for (const info of uninspectable) {
                const pick = resolveBrowsePick("/Users/me/code", info);

                expect(pick).toEqual({ base: "/Users/me/code" });
                expect(targetPath(pick, "My Project")).toBe("/Users/me/code/my_project");
            }
        });
    });

    describe("a folder that IS a project", () => {
        // The class of bug this guards: composing `<pick>/<derived folder>` puts a
        // project inside a project (and scaffolds a package no workspace toml lists).
        // No project pick may ever resolve to a target below the chosen folder.
        it.each([
            ["/Users/me/projectexp", "projectexp"],
            ["/Users/me/projectexp/", "projectexp"],
            ["/Users/me/projectexp///", "projectexp"],
            ["/projectexp", "projectexp"],
            ["C:\\Users\\me\\projectexp", "projectexp"],
            ["C:\\Users\\me\\projectexp\\", "projectexp"],
        ])("resolves %s onto the project itself, never below it", (picked, folder) => {
            const pick = resolveBrowsePick(picked, { isProject: true, name: "projectexp" });

            expect(pick.directoryName).toBe(folder);
            // The target IS the pick — not a child of it. Compared on segments so a
            // separator normalized by joinPath does not read as a different location.
            expect(targetPath(pick, "Default").split(/[/\\]+/).filter(Boolean))
                .toEqual(picked.split(/[/\\]+/).filter(Boolean));
        });

        it("does not derive the folder from the project name, which may differ", () => {
            // `[workspace].title` is free text and need not match the directory.
            const pick = resolveBrowsePick("/Users/me/projectexp", {
                isProject: true,
                name: "My Integration Project",
            });

            expect(pick.projectName).toBe("My Integration Project");
            expect(pick.directoryName).toBe("projectexp");
            expect(targetPath(pick, "My Integration Project")).toBe("/Users/me/projectexp");
        });

        it("reports no name for a project without a title", () => {
            for (const info of [{ isProject: true }, { isProject: true, name: "" }]) {
                const pick = resolveBrowsePick("/Users/me/projectexp", info);

                expect(pick.projectName).toBeUndefined();
                // Still snapped — a missing title must not send the target back inside.
                expect(pick.directoryName).toBe("projectexp");
            }
        });

        it("holds a bare relative pick as the target rather than nesting below it", () => {
            const pick = resolveBrowsePick("projectexp", { isProject: true, name: "projectexp" });

            expect(pick).toEqual({ base: "projectexp", directoryName: "", projectName: "projectexp" });
            expect(targetPath(pick, "Default")).toBe("projectexp");
        });

        it("keeps a root-only pick as the location, since it has no folder of its own", () => {
            const pick = resolveBrowsePick("/", { isProject: true, name: "root" });

            expect(pick.directoryName).toBeUndefined();
            expect(pick.base).toBe("/");
        });
    });
});

describe("applyBrowsePick", () => {
    const DEFAULT_NAME = "Default";
    const pristine: BrowsePickState = {
        projectName: DEFAULT_NAME,
        projectNameTouched: false,
        displacedName: null,
        folderPinnedByPick: false,
    };
    const PROJECT = { isProject: true, name: "projectexp" };
    const PLAIN = { isProject: false };

    /** Carries the reducer's output back into the state the next pick reads. */
    const next = (
        state: BrowsePickState,
        pickedPath: string,
        info: { isProject?: boolean; name?: string } | null,
        options?: { adoptProjectName?: boolean }
    ): BrowsePickState & { base: string; target: string } => {
        const applied = applyBrowsePick(pickedPath, info, state, options);
        // Mirrors the views: `pin` holds the segment, `recouple` gives it back to the name,
        // `keep` leaves whatever the previous state had.
        const directoryName =
            applied.folder.action === "pin"
                ? applied.folder.directoryName
                : applied.folder.action === "recouple"
                    ? sanitizePackageName(applied.folder.displayName)
                    : sanitizePackageName(applied.projectName);
        const { base, folder, ...rest } = applied;
        return { ...rest, base, target: joinPath(base, directoryName) };
    };

    describe("moving off an existing project (the reported sequence)", () => {
        it("leaves neither the old project's folder on the path nor its name in the field", () => {
            const onProject = next(pristine, "/Users/me/projectexp", PROJECT, { adoptProjectName: true });
            expect(onProject.target).toBe("/Users/me/projectexp");
            expect(onProject.projectName).toBe("projectexp");

            const onEmpty = next(onProject, "/Users/me/empty", PLAIN, { adoptProjectName: true });

            expect(onEmpty.target).toBe("/Users/me/empty/default");
            expect(onEmpty.projectName).toBe(DEFAULT_NAME);
            expect(onEmpty.projectNameTouched).toBe(false);
        });

        it("restores a name the user had authored before the project displaced it", () => {
            const typed: BrowsePickState = { ...pristine, projectName: "My Thing", projectNameTouched: true };

            const onProject = next(typed, "/Users/me/projectexp", PROJECT, { adoptProjectName: true });
            expect(onProject.projectName).toBe("projectexp");

            const onEmpty = next(onProject, "/Users/me/empty", PLAIN, { adoptProjectName: true });

            expect(onEmpty.projectName).toBe("My Thing");
            expect(onEmpty.projectNameTouched).toBe(true);
            expect(onEmpty.target).toBe("/Users/me/empty/my_thing");
        });

        it("restores the ORIGINAL name after hopping between several projects", () => {
            let state = next(pristine, "/Users/me/projectexp", PROJECT, { adoptProjectName: true });
            state = next(state, "/Users/me/other", { isProject: true, name: "other" }, { adoptProjectName: true });
            expect(state.projectName).toBe("other");

            const onEmpty = next(state, "/Users/me/empty", PLAIN, { adoptProjectName: true });

            // Not "projectexp" — hopping projects must not make an earlier project's title
            // the thing the user gets back.
            expect(onEmpty.projectName).toBe(DEFAULT_NAME);
            expect(onEmpty.target).toBe("/Users/me/empty/default");
        });

        it("undoes the pin for a form that never adopts the name", () => {
            const typed: BrowsePickState = { ...pristine, projectName: "My Thing", projectNameTouched: true };

            const onProject = next(typed, "/Users/me/projectexp", PROJECT);
            expect(onProject.target).toBe("/Users/me/projectexp");
            // The name is the user's and no pick took it — so it survives untouched.
            expect(onProject.projectName).toBe("My Thing");

            const onEmpty = next(onProject, "/Users/me/empty", PLAIN);

            expect(onEmpty.target).toBe("/Users/me/empty/my_thing");
            expect(onEmpty.projectName).toBe("My Thing");
            expect(onEmpty.projectNameTouched).toBe(true);
        });
    });

    describe("a project that reports no title", () => {
        it("adopts its folder as the name rather than leaving the previous adoption", () => {
            const onTitled = applyBrowsePick("/Users/me/projectexp", PROJECT, pristine, {
                adoptProjectName: true,
            });
            expect(onTitled.projectName).toBe("projectexp");

            const onUntitled = applyBrowsePick("/Users/me/other", { isProject: true }, onTitled, {
                adoptProjectName: true,
            });

            // Not "projectexp" — the field must never label a project that is not the target.
            expect(onUntitled.projectName).toBe("other");
        });
    });

    describe("state the user has claimed back", () => {
        // Typing a name recouples the folder to it, so the views clear BOTH memories —
        // a later pick must not resurrect the project title over what the user typed.
        it("keeps a name typed after a project pick", () => {
            const onProject = next(pristine, "/Users/me/projectexp", PROJECT, { adoptProjectName: true });
            const typedAfter: BrowsePickState = {
                ...onProject,
                projectName: "My Thing",
                projectNameTouched: true,
                displacedName: null,
                folderPinnedByPick: false,
            };

            const onEmpty = next(typedAfter, "/Users/me/empty", PLAIN, { adoptProjectName: true });

            expect(onEmpty.projectName).toBe("My Thing");
            expect(onEmpty.target).toBe("/Users/me/empty/my_thing");
        });

        // Editing the path's last segment claims only the FOLDER; the adopted name is still
        // the pick's, so it reverts while the hand-edited segment survives.
        it("reverts the adopted name but keeps a hand-edited segment", () => {
            const onProject = next(pristine, "/Users/me/projectexp", PROJECT, { adoptProjectName: true });
            const segmentEdited: BrowsePickState = { ...onProject, folderPinnedByPick: false };

            const applied = applyBrowsePick("/Users/me/empty", PLAIN, segmentEdited, { adoptProjectName: true });

            expect(applied.folder).toEqual({ action: "keep" });
            expect(applied.projectName).toBe(DEFAULT_NAME);
            expect(applied.displacedName).toBeNull();
        });
    });

    describe("state no pick imposed", () => {
        it("keeps the segment when no pick ever owned it", () => {
            const untouchedByPick: BrowsePickState = {
                ...pristine,
                projectName: "My Thing",
                projectNameTouched: true,
            };

            const applied = applyBrowsePick("/Users/me/elsewhere", PLAIN, untouchedByPick);

            // `keep` leaves the segment alone — the views hold whatever the user typed.
            expect(applied.folder).toEqual({ action: "keep" });
            expect(applied.base).toBe("/Users/me/elsewhere");
            expect(applied.projectName).toBe("My Thing");
        });

        it("never displaces a name twice for the same adoption", () => {
            const typed: BrowsePickState = { ...pristine, projectName: "My Thing", projectNameTouched: true };

            const once = applyBrowsePick("/Users/me/projectexp", PROJECT, typed, { adoptProjectName: true });
            const twice = applyBrowsePick("/Users/me/projectexp", PROJECT, once, { adoptProjectName: true });

            expect(twice.displacedName).toEqual({ name: "My Thing", touched: true });
        });
    });
});
