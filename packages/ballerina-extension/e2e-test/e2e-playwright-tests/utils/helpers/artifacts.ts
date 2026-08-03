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

import { getWebview } from "./webview";
import { page } from "./setup";
import { BI_INTEGRATOR_LABEL, BI_WEBVIEW_NOT_FOUND_ERROR } from "./constants";

/**
 * Add an artifact to the project
 */
export async function addArtifact(artifactName: string, testId: string) {
    console.log(`Adding artifact: ${artifactName}`);
    const artifactWebView = await getWebview(BI_INTEGRATOR_LABEL, page);
    if (!artifactWebView) {
        throw new Error(BI_WEBVIEW_NOT_FOUND_ERROR);
    }
    // Navigate to the overview page
    await artifactWebView.getByRole('button', { name: ' Add Artifact' }).click();
    // how to get element by id
    const addArtifactBtn = artifactWebView.locator(`#${testId}`);
    await addArtifactBtn.waitFor();
    await addArtifactBtn.click();
}

/**
 * Add an artifact and return its just-opened creation webview. Shared by
 * every artifact's create test — `addArtifact` followed by an iframe fetch
 * is identical across artifact types.
 */
export async function createArtifactAndGetWebview(artifactName: string, testId: string) {
    await addArtifact(artifactName, testId);
    return getWebview(BI_INTEGRATOR_LABEL, page);
}

/**
 * Enable ICP (Integration Control Plane)
 */
export async function enableICP() {
    console.log('Enabling ICP');
    const webview = await getWebview(BI_INTEGRATOR_LABEL, page);
    if (!webview) {
        throw new Error(BI_WEBVIEW_NOT_FOUND_ERROR);
    }
    const icpToggle = webview.getByRole('checkbox', { name: 'Enable ICP monitoring' });
    await icpToggle.waitFor();
    if (!(await icpToggle.isChecked())) {
        await icpToggle.click();
    }
}
