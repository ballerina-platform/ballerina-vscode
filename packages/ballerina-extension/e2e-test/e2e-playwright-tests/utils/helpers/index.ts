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

// Re-export from setup
export { 
    page, 
    vscode, 
    lastTestFailed,
    resourcesFolder, 
    newProjectPath,
    extensionsFolder,
    initTest,
    initMigrationTest,
    reacquireWindow,
    createProject,
    setupBallerinaIntegrator,
    toggleNotifications,
    zipProjectSnapshot,
    captureFailureScreenshot,
    executeBallPullCommand
} from './setup';

// Re-export from webview
export { getWebview } from './webview';

// Re-export from artifacts
export { addArtifact, createArtifactAndGetWebview, enableICP } from './artifacts';

// Re-export from serviceActions
export { confirmSaveChangesAndGoBack, deleteArtifactFromTree } from './serviceActions';

// Re-export from verification
export { verifyGeneratedSource, verifyRecordFields } from './verification';

// Re-export from progress
export { logStep } from './progress';

// Re-export constants
export { BI_INTEGRATOR_LABEL, BI_WEBVIEW_NOT_FOUND_ERROR, DEFAULT_PROJECT_NAME, DEFAULT_PROJECT_FOLDER_NAME, BI_SIDEBAR_VIEW_ID } from './constants';
