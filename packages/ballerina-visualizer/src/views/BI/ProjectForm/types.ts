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

/**
 * Base form data shared between add/create integration forms
 */
export interface BaseProjectFormData {
    integrationName: string;
    packageName: string;
    orgName: string;
    version: string;
    isLibrary: boolean;
}

/**
 * Form data for adding an integration to an existing project
 */
export interface AddProjectFormData extends BaseProjectFormData {
    // Kept for RPC payload compatibility; conceptually this is the project name.
    workspaceName?: string;
    projectHandle?: string;
    /**
     * On-disk folder for the new integration/library inside the project, derived
     * from its display name and independent of `packageName`.
     */
    packageDirectoryName?: string;
}

/**
 * Form data for the main integration form (creating a new project or integration)
 */
export interface ProjectFormData extends BaseProjectFormData {
    path: string;
    createDirectory: boolean;
    // Kept for RPC payload compatibility; conceptually this is "create as project".
    createAsWorkspace: boolean;
    // Kept for RPC payload compatibility; conceptually this is the project name.
    workspaceName: string;
}
