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

import { expect, Frame } from '@playwright/test';
import { page } from './setup';
import { ProjectExplorer } from '../pages';

/**
 * Waits for the "Save Changes" button to reflect a saved (disabled) state
 * after `form.submit('Save Changes')`, then clicks the side-panel back
 * button. Shared by every artifact's edit test — the save-changes button
 * markup and back-navigation are identical across artifact types.
 */
export async function confirmSaveChangesAndGoBack(webview: Frame): Promise<void> {
    const saveChangesBtn = webview.locator('#save-changes-btn vscode-button[appearance="primary"]');
    await saveChangesBtn.waitFor({ state: 'visible' });
    await expect(saveChangesBtn).toHaveClass('disabled', { timeout: 5000 });
    await expect(saveChangesBtn).toHaveText('Save Changes');

    const backBtn = webview.locator('[data-testid="back-button"]');
    await backBtn.waitFor();
    await backBtn.click();
}

/**
 * Deletes the artifact at `treeItemPath` via the project explorer's
 * right-click context menu and waits for it to disappear from the tree.
 * Shared by every artifact's delete test.
 */
export async function deleteArtifactFromTree(treeItemPath: string[]): Promise<void> {
    const projectExplorer = new ProjectExplorer(page.page);
    const treeItem = await projectExplorer.findItem(treeItemPath);
    await treeItem.click({ button: 'right' });

    const deleteButton = page.page.getByRole('button', { name: 'Delete' }).first();
    await deleteButton.waitFor({ timeout: 5000 });
    await deleteButton.click();
    await page.page.waitForTimeout(500);

    await expect(treeItem).not.toBeVisible({ timeout: 10000 });
}
