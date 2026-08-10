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

/** The wizard's three steps: Name, then Integration Type, then Configure.
 *  (An existing package owns its name, so that mode starts at the Type step.) */
export type WizardStep = 0 | 1 | 2;

/**
 * The project a new integration/library is being created into, resolved by the
 * unified Create chooser (screen 1) and handed to the wizard / library form.
 * In the always-workspace model the artifact is always a package inside a
 * workspace: `workspacePath` is that workspace's folder (and becomes the form's
 * `baseDir`), and `isNewProject` decides whether the workspace is scaffolded
 * fresh or the package is added into an existing one.
 */
export interface ProjectContext {
    /** True when a brand-new project (workspace) is being created for this artifact. */
    isNewProject: boolean;
    /** The workspace folder — the artifact package is created inside it. */
    workspacePath: string;
    /** Display name (title) for the workspace when `isNewProject` is true. */
    workspaceName?: string;
    /**
     * When true, the currently open standalone integration is converted into a new
     * workspace at `workspacePath` (the existing package is moved inside it) before
     * this artifact is added — used by the "Convert to Project & add a new
     * integration" flow so it runs through this same wizard.
     */
    convertToWorkspace?: boolean;
}

/** Name-step form state. */
export interface BasicInfo {
    /** The integration display name; "Untitled" is applied only on skip. */
    integrationName: string;
    /** Parent directory the integration folder is created under. Seeded from the default creation path. */
    baseDir: string;
    /**
     * Folder name (the editable last segment of the path). Defaults to the
     * name-derived value and tracks the integration name until the user edits it;
     * independent of the Ballerina package name.
     */
    directoryName: string;
    /** True once the user manually edited the directory segment away from the name-derived default. */
    dirTouched: boolean;
    /** True once the user edited/browsed the path — gates realtime path validation. */
    pathTouched: boolean;
}

/**
 * Lifecycle of the throwaway staging package used to fetch the Configure-step artifact
 * model. It lives in the OS temp dir (not at the user's path) and is name/path
 * agnostic, so it's created once on first entry to the Configure step and reused.
 */
export type ScaffoldState =
    | { status: "idle" }
    | { status: "creating" }
    /** `projectRoot` is the temp staging package root. */
    | { status: "ready"; projectRoot: string }
    | { status: "error"; error: string };
