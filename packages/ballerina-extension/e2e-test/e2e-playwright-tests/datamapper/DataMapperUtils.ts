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

import { expect, Frame, Locator } from "@playwright/test";
import * as fs from 'fs';
import { newProjectPath, page } from '../utils/helpers';
import path from "path";

const dmDataDir = path.join(__dirname, 'dm-data');
/** Ballerina package root (same as workspace folder for template-based e2e projects). */
const projectDir = newProjectPath;

export class DataMapper {

    constructor(private webView: Frame) {
    }

    public async waitFor() {
        await this.webView.locator('#data-mapper-canvas-container').waitFor();
    }

    public getWebView() {
        return this.webView;
    }

    public async scrollClickOutput(locator: Locator) {
        await this.scrollOutputUntilClickable(locator);
        await locator.click();
    }

    public async scrollOutputUntilClickable(locator: Locator) {
        const outputNode = this.webView.locator(`div[data-testid$="Output-node"]`);
        await outputNode.hover();

        for (let i = 0; !(await this.isClickable(locator)) && i < 5; i++) {
            await page.page.mouse.wheel(0, 400);
        }
    }

    public async isClickable(element: Locator): Promise<boolean> {

        // Check if the element is not covered by other elements
        const isNotObstructed = await element.evaluate((el) => {
            const rect = el.getBoundingClientRect();
            const elementAtPoint = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
            return elementAtPoint === el || el.contains(elementAtPoint) || (elementAtPoint?.contains(el) ?? false);
        });

        return isNotObstructed;
    }

    public async waitForProgressEnd() {
        await this.webView.waitForSelector('vscode-progress-ring', { state: 'detached' });
    }

    public async expandField(fieldFQN: string) {
        const expandButton = this.webView.locator(`div[id="expand-or-collapse-${fieldFQN}"]`);

        // Expand only if collapsed
        if (await expandButton.locator('.codicon-chevron-right').isVisible()) {
            await expandButton.click();
            await expandButton.locator('.codicon-chevron-down').waitFor();
        }
    }

    public async refresh() {
        await this.webView.locator('vscode-button[title="Refresh all mappings"]').click();
        await this.waitForProgressEnd();
    }

    public async mapFields(sourceFieldFQN: string, targetFieldFQN: string, menuOptionId?: string) {

        const sourceField = this.webView.locator(`div[id="recordfield-${sourceFieldFQN}"]`);
        const targetField = this.webView.locator(`div[id="recordfield-${targetFieldFQN}"] .port`);

        await targetField.waitFor();
        await sourceField.waitFor();

        await sourceField.click({ force: true });

        await expect(sourceField).toHaveCSS('outline-style', 'solid');

        await targetField.click({ force: true });

        if (menuOptionId) {
            const menuItem = this.webView.locator(`#menu-item-${menuOptionId}`);
            await menuItem.click();
            await menuItem.waitFor({ state: 'hidden' });
        }
        try {
            await this.webView.waitForSelector('vscode-progress-ring', { state: 'attached', timeout: 3000 });
        } catch (error) { }
        try {
            await this.webView.waitForSelector('vscode-progress-ring', { state: 'detached' });
        } catch (error) { }

    }

    public async selectConfigMenuItem(fieldFQN: string, menuOptionText: string) {

        const configMenu = this.webView.locator(`[id="recordfield-${fieldFQN}"] #component-list-menu-btn`);
        await configMenu.waitFor();
        await configMenu.click();

        const menuOption = this.webView.getByTestId(`context-menu-${menuOptionText}`);
        await menuOption.waitFor();
        await menuOption.click();

        await menuOption.waitFor({ state: 'detached' });
        await this.waitForProgressEnd();
    }

    public async goPrevViewBreadcrumb() {
        const breadcrumbs = this.webView.locator(`a[data-testid^="dm-header-breadcrumb-"]`);
        const previousCrumb = this.webView.locator(`a[data-testid="dm-header-breadcrumb-${await breadcrumbs.count() - 1}"]`);
        await previousCrumb.waitFor();
        await previousCrumb.click();
        await previousCrumb.waitFor({ state: 'detached' });
    }

    public async goPrevViewBackButton() {
        const breadcrumbs = this.webView.locator(`a[data-testid^="dm-header-breadcrumb-"]`);
        const previousCrumb = this.webView.locator(`a[data-testid="dm-header-breadcrumb-${await breadcrumbs.count() - 1}"]`);
        await this.webView.getByTestId('back-button').click();
        await previousCrumb.waitFor({ state: 'detached' });
    }

    public async saveSnapshot(snapshotFile: string) {
        const root = this.webView.locator(`div#data-mapper-canvas-container`);
        await root.waitFor();
        fs.writeFileSync(snapshotFile, await root.innerHTML());
    }

    public async expectErrorLink(locator: Locator) {
        await locator.waitFor({ state: 'attached' });
        const hasDiagnostic = await locator.evaluate((el) => el.getAttribute('data-diagnostics'));
        expect(hasDiagnostic).toBeTruthy();
    }

}

export namespace FileUtils {

    export async function updateProjectFileSync(sourceFile: string, targetFile: string) {
        const sourcePath = path.join(dmDataDir, sourceFile);
        const targetPath = path.join(newProjectPath, targetFile);
        // Keep VS Code working copies synced before external disk write to avoid save/unsavable prompts.
        await page.executePaletteCommand('File: Save All');
        fs.writeFileSync(targetPath, fs.readFileSync(sourcePath, 'utf8'), { flag: 'w' });
        // Explicitly touch only the updated file so file watchers get a path-specific change signal.
        const now = new Date();
        fs.utimesSync(targetPath, now, now);
    }

    export function updateDataFileSync(sourceFile: string, targetFile: string) {
        const sourcePath = path.join(newProjectPath, sourceFile);
        const targetPath = path.join(dmDataDir, targetFile);
        fs.writeFileSync(targetPath, fs.readFileSync(sourcePath, 'utf8'));
    }

    export async function verifyFileContent(comparingFile: string, projectFile: string) {

        // // Uncomment this blcok for update data files
        // console.log({comparingFile, projectFile});
        // await page.page.pause();
        // updateDataFileSync(projectFile, comparingFile);
        // return true;
        // // End of the block

        return compareFilesSync(
            path.join(dmDataDir, comparingFile),
            path.join(projectDir, projectFile)
        );
    }

    export function compareFilesSync(file1: string, file2: string, checkFormatting?: boolean) {
        let file1Content = fs.readFileSync(file1, 'utf8').replaceAll('\r\n', '\n');
        let file2Content = fs.readFileSync(file2, 'utf8').replaceAll('\r\n', '\n');

        // TODO: Remove skip formatting check after formatting is enabled in Data Mapper
        if (!checkFormatting) {
            file1Content = file1Content.replace(/\n/g, '').replace(/\s+/g, '');
            file2Content = file2Content.replace(/\n/g, '').replace(/\s+/g, '');
        }

        return file1Content === file2Content;
    }
}

export namespace TestScenarios {

    export async function testBasicMappings(dmWebView: Frame, projectFile: string, compDir: string, needRefresh?: boolean) {
        console.log('Test Basic Mappings');

        const dm = new DataMapper(dmWebView);
        await dm.waitFor();

        await dm.expandField('input');
        if (needRefresh) {
            await dm.refresh();
        }

        console.log(' - Map child fields');
        // direct mapping
        // objectOutput.output.oPrimDirect = input.iPrimDirect;
        await dm.mapFields('input.iPrimDirect', 'objectOutput.output.oPrimDirect');
        const loc0 = dmWebView.getByTestId('link-from-input.iPrimDirect.OUT-to-objectOutput.output.oPrimDirect.IN');
        await loc0.waitFor({ state: 'attached' });

        // direct mapping with error
        // objectOutput.output.oPrimDirectErr = input.iPrimDirectErr;
        await dm.mapFields('input.iPrimDirectErr', 'objectOutput.output.oPrimDirectErr', 'direct');
        const loc1 = dmWebView.getByTestId('link-from-input.iPrimDirectErr.OUT-to-objectOutput.output.oPrimDirectErr.IN')
        await dm.expectErrorLink(loc1);

        // many-one mapping
        // objectOutput.output.oManyOne = input.iManyOne1 + input.iManyOne2 + input.iManyOne3;
        await dm.mapFields('input.iManyOne1', 'objectOutput.output.oManyOne');
        await dm.mapFields('input.iManyOne2', 'objectOutput.output.oManyOne');
        await dm.mapFields('input.iManyOne3', 'objectOutput.output.oManyOne');

        await dmWebView.getByTestId('link-from-input.iManyOne1.OUT-to-datamapper-intermediate-port').waitFor({ state: 'attached' });
        await dmWebView.getByTestId('link-from-input.iManyOne2.OUT-to-datamapper-intermediate-port').first().waitFor({ state: 'attached' });
        await dmWebView.getByTestId('link-from-input.iManyOne3.OUT-to-datamapper-intermediate-port').first().waitFor({ state: 'attached' });
        await dmWebView.getByTestId('link-from-datamapper-intermediate-port-to-objectOutput.output.oManyOne.IN').waitFor({ state: 'attached' });
        const loc2 = dmWebView.getByTestId('link-connector-node-objectOutput.output.oManyOne.IN')
        await loc2.waitFor();

        // many-one mapping with error
        // objectOutput.output.oManyOneErr = input.iManyOneErr1 + input.iPrimDirectErr + input.iManyOneErr2
        await dm.mapFields('input.iManyOneErr1', 'objectOutput.output.oManyOneErr');
        await dm.mapFields('input.iPrimDirectErr', 'objectOutput.output.oManyOneErr', 'direct');
        await dm.mapFields('input.iManyOneErr2', 'objectOutput.output.oManyOneErr', 'direct');

        await dm.expectErrorLink(dmWebView.getByTestId('link-from-input.iManyOneErr1.OUT-to-datamapper-intermediate-port'));
        await dm.expectErrorLink(dmWebView.getByTestId('link-from-input.iPrimDirectErr.OUT-to-datamapper-intermediate-port'));
        await dm.expectErrorLink(dmWebView.getByTestId('link-from-input.iManyOneErr2.OUT-to-datamapper-intermediate-port'));
        await dm.expectErrorLink(dmWebView.getByTestId('link-from-datamapper-intermediate-port-to-objectOutput.output.oManyOneErr.IN'));
        const loc3 = dmWebView.getByTestId('link-connector-node-objectOutput.output.oManyOneErr.IN');
        await loc3.getByTestId('expression-label-diagnostic').waitFor();

        // object direct mapping
        // objectOutput.output.oObjDirect= input.iObjDirect;
        await dm.mapFields('input.iObjDirect', 'objectOutput.output.oObjDirect', 'direct');
        await dmWebView.getByTestId('link-from-input.iObjDirect.OUT-to-objectOutput.output.oObjDirect.IN').waitFor({ state: 'attached' });

        // object direct mapping with error
        // objectOutput.output.oObjDirectErr = input.iObjDirect
        await dm.mapFields('input.iObjDirect', 'objectOutput.output.oObjDirectErr', 'direct');
        await dm.expectErrorLink(dmWebView.getByTestId('link-from-input.iObjDirect.OUT-to-objectOutput.output.oObjDirectErr.IN'));

        // object properties mapping
        // objectOutput.output.oObjProp.p1 = input.iObjDirect.d1;
        await dm.mapFields('input.iObjDirect.d1', 'objectOutput.output.oObjProp.p1');
        const loc4 = dmWebView.getByTestId('link-from-input.iObjDirect.d1.OUT-to-objectOutput.output.oObjProp.p1.IN');
        await loc4.waitFor({ state: 'attached' });

        // objectOutput.output.oObjProp.p2 = input.iObjProp.d2;
        await dm.mapFields('input.iObjProp.op2', 'objectOutput.output.oObjProp.p2', 'direct');
        await dm.expectErrorLink(dmWebView.getByTestId('link-from-input.iObjProp.op2.OUT-to-objectOutput.output.oObjProp.p2.IN'));

        expect(await FileUtils.verifyFileContent(`basic/${compDir}/map1.bal.txt`, projectFile)).toBeTruthy();

        console.log(' - Delete child field mappings');

        await loc0.click({ force: true });
        await dmWebView.getByTestId('expression-label-for-input.iPrimDirect.OUT-to-objectOutput.output.oPrimDirect.IN')
            .locator('.codicon-trash').click({ force: true });
        await loc0.waitFor({ state: 'detached' });

        await loc1.click({ force: true });
        await dmWebView.getByTestId('expression-label-for-input.iPrimDirectErr.OUT-to-objectOutput.output.oPrimDirectErr.IN')
            .locator('.codicon-trash').click({ force: true });
        await loc1.waitFor({ state: 'detached' });

        await loc2.locator('.codicon-trash').click({ force: true });
        await loc2.waitFor({ state: 'detached' });

        await loc3.locator('.codicon-trash').click({ force: true });
        await loc3.waitFor({ state: 'detached' });

        await loc4.click({ force: true });
        await dmWebView.getByTestId('expression-label-for-input.iObjDirect.d1.OUT-to-objectOutput.output.oObjProp.p1.IN')
            .locator('.codicon-trash').click({ force: true });
        await loc4.waitFor({ state: 'detached' });

        expect(await FileUtils.verifyFileContent(`basic/${compDir}/del1.bal.txt`, projectFile)).toBeTruthy();

        console.log(' - Clear All Mappings');

        await dmWebView.locator('vscode-button[title="Clear all mappings"]').click();
        await dm.waitForProgressEnd();
        const links = dmWebView.locator('[data-testid^="link-from-"]');
        await expect(links).toHaveCount(0);

        expect(await FileUtils.verifyFileContent(`basic/${compDir}/del2.bal.txt`, projectFile)).toBeTruthy();


        console.log(' - Map root fields');

        // root mapping
        await dm.mapFields('input', 'objectOutput.output', 'direct');
        const locRoot = dmWebView.getByTestId('link-from-input.OUT-to-objectOutput.output.IN');
        await dm.expectErrorLink(locRoot);

        expect(await FileUtils.verifyFileContent(`basic/${compDir}/map2.bal.txt`, projectFile)).toBeTruthy();

        console.log(' - Delete root field mapping');
        // delete root mapping
        await locRoot.click({ force: true });
        await dmWebView.getByTestId('expression-label-for-input.OUT-to-objectOutput.output.IN').locator('.codicon-trash').click({ force: true });
        await locRoot.waitFor({ state: 'detached' });

        expect(await FileUtils.verifyFileContent(`basic/${compDir}/del2.bal.txt`, projectFile)).toBeTruthy();
    }

    export async function testArrayInnerMappings(dmWebView: Frame, projectFile: string, compDir: string, needRefresh?: boolean) {

        console.log('Test Array Inner Mappings');

        const dm = new DataMapper(dmWebView);
        await dm.waitFor();

        await dm.expandField('input');

        if (needRefresh) {
            await dm.refresh();
            await dmWebView.locator(`div[id="recordfield-input.iArr1D"]`).waitFor();
        }

        console.log(' - Input/Output preview');

        await dm.expandField('input.iArr1D');

        await dmWebView.locator('div[id="recordfield-input.iArr1D.iArr1D"]').waitFor();

        await dm.expandField('objectOutput.output.oArr1D');
        await dmWebView.locator('div[id="recordfield-objectOutput.output.oArr1D.oArr1D"]').waitFor();

        console.log(' - Map using query expression');
        await dm.mapFields('input.iArr1D', 'objectOutput.output.oArr1D', 'a2a-inner');

        console.log(' - Map within focused view');
        await dm.mapFields('iArr1DItem.p2', 'queryOutput.oArr1D.p2', 'direct');
        const loc1 = dmWebView.getByTestId('link-from-iArr1DItem.p2.OUT-to-queryOutput.oArr1D.p2.IN');
        await dm.expectErrorLink(loc1);

        await dm.mapFields('iArr1DItem.p2', 'queryOutput.oArr1D.p1');
        await dm.mapFields('iArr1DItem.p3', 'queryOutput.oArr1D.p1');

        await dmWebView.getByTestId('link-from-iArr1DItem.p2.OUT-to-datamapper-intermediate-port').waitFor({ state: 'attached' });
        await dmWebView.getByTestId('link-from-iArr1DItem.p3.OUT-to-datamapper-intermediate-port').waitFor({ state: 'attached' });
        await dmWebView.getByTestId('link-from-datamapper-intermediate-port-to-queryOutput.oArr1D.p1.IN').waitFor({ state: 'attached' });

        const loc2 = dmWebView.getByTestId('link-connector-node-queryOutput.oArr1D.p1.IN');
        await loc2.waitFor();

        expect(await FileUtils.verifyFileContent(`array-inner/${compDir}/map1.bal.txt`, projectFile)).toBeTruthy();

        console.log(' - Go back to root (using breadcrumb)');
        await dm.goPrevViewBreadcrumb();
        const loc0 = dmWebView.getByTestId('link-connector-node-objectOutput.output.oArr1D.IN');
        await loc0.waitFor();

        console.log(' - Goto focused view again');
        await dmWebView.getByTestId('expand-array-fn-output.oArr1D').click();
        await dmWebView.getByTestId('link-from-input.iArr1D.OUT-to-datamapper-intermediate-port').waitFor({ state: 'attached' });
        await dmWebView.getByTestId('link-from-datamapper-intermediate-port-to-queryOutput.oArr1D.Q#.IN').waitFor({ state: 'attached' });

        console.log(' - Delete within focused view');
        await loc1.click({ force: true });
        await dmWebView.getByTestId('expression-label-for-iArr1DItem.p2.OUT-to-queryOutput.oArr1D.p2.IN')
            .locator('.codicon-trash').click({ force: true });
        await loc1.waitFor({ state: 'detached' });

        await loc2.locator('.codicon-trash').click({ force: true });
        await loc2.waitFor({ state: 'detached' });

        expect(await FileUtils.verifyFileContent(`array-inner/${compDir}/del1.bal.txt`, projectFile)).toBeTruthy();

        console.log(' - Map roots within focused view');
        await dm.mapFields('iArr1DItem', 'queryOutput.oArr1D', 'direct');
        const loc3 = dmWebView.getByTestId('link-from-iArr1DItem.OUT-to-queryOutput.oArr1D.IN');
        await loc3.waitFor();

        expect(await FileUtils.verifyFileContent(`array-inner/${compDir}/map2.bal.txt`, projectFile)).toBeTruthy();

        console.log(' - Delete root mapping within focused view');
        await loc3.click({ force: true });
        await dmWebView.getByTestId('expression-label-for-iArr1DItem.OUT-to-queryOutput.oArr1D.IN')
            .locator('.codicon-trash').click({ force: true });
        await loc3.waitFor({ state: 'detached' });

        expect(await FileUtils.verifyFileContent(`array-inner/${compDir}/del2.bal.txt`, projectFile)).toBeTruthy();

        console.log(' - Go back to root view (using back button)');
        await dm.goPrevViewBackButton();

        console.log(' - Initialize and add element using config menu');
        await dm.selectConfigMenuItem('objectOutput.output.oArr1D', 'Initialize Array');
        await dm.waitForProgressEnd();
        const locArrInit = dmWebView.getByTestId('array-widget-field-objectOutput.output.oArr1D.IN');
        await locArrInit.waitFor();
        await expect(locArrInit).toHaveText('[]');

        await dm.selectConfigMenuItem('objectOutput.output.oArr1D', 'Add Element');

        await dmWebView.locator('div[id="recordfield-objectOutput.output.oArr1D.0"]').waitFor();

        console.log(' - Add element using button');
        const addElementBtn = dmWebView.getByTestId('array-widget-objectOutput.output.oArr1D.IN-add-element');
        await addElementBtn.click();
        await dm.waitForProgressEnd();
        await dmWebView.locator('div[id="recordfield-objectOutput.output.oArr1D.1"]').waitFor();

        await addElementBtn.click();
        await dm.waitForProgressEnd();
        await dmWebView.locator('div[id="recordfield-objectOutput.output.oArr1D.2"]').waitFor();

        console.log(' - Map to array elements');
        await dm.mapFields('input.p1', 'objectOutput.output.oArr1D.0.p1', 'direct');
        const loc4 = dmWebView.getByTestId('link-from-input.p1.OUT-to-objectOutput.output.oArr1D.0.p1.IN');
        await dm.expectErrorLink(loc4);

        await dm.mapFields('input.p2', 'objectOutput.output.oArr1D.1.p1');
        await dmWebView.getByTestId('link-from-input.p2.OUT-to-objectOutput.output.oArr1D.1.p1.IN').waitFor({ state: 'attached' });

        await dm.mapFields('input.p1', 'objectOutput.output.oArr1D.2', 'direct');
        const loc5 = dmWebView.getByTestId('link-from-input.p1.OUT-to-objectOutput.output.oArr1D.2.IN');
        await dm.expectErrorLink(loc5);

        expect(await FileUtils.verifyFileContent(`array-inner/${compDir}/map3.bal.txt`, projectFile)).toBeTruthy();

        console.log(' - Delete array element mapping, entire element and entire array');
        await loc4.click({ force: true });
        await dmWebView.getByTestId('expression-label-for-input.p1.OUT-to-objectOutput.output.oArr1D.0.p1.IN')
            .locator('.codicon-trash').click({ force: true });
        await loc4.waitFor({ state: 'detached' });

        await loc5.click({ force: true });
        await dmWebView.getByTestId('expression-label-for-input.p1.OUT-to-objectOutput.output.oArr1D.2.IN')
            .locator('.codicon-trash').click({ force: true });
        await loc5.waitFor({ state: 'detached' });

        await dm.selectConfigMenuItem('objectOutput.output.oArr1D.1', 'Delete Element');
        await dm.waitForProgressEnd();
        await dmWebView.locator('div[id="recordfield-objectOutput.output.oArr1D.1"]').waitFor({ state: 'detached' });

        expect(await FileUtils.verifyFileContent(`array-inner/${compDir}/del3.bal.txt`, projectFile)).toBeTruthy();

        await dm.selectConfigMenuItem('objectOutput.output.oArr1D', 'Delete Array');

        expect(await FileUtils.verifyFileContent(`array-inner/${compDir}/del4.bal.txt`, projectFile)).toBeTruthy();
    }

    export async function testArrayRootMappings(dmWebView: Frame, projectFile: string, compDir: string, needRefresh?: boolean) {
        console.log('Test Array Root Mappings');

        const dm = new DataMapper(dmWebView);
        await dm.waitFor();

        await dm.expandField('input');

        if (needRefresh) {
            await dm.refresh();
        }

        console.log(' - Input/Output preview');

        await dmWebView.getByText('<inputItem>').waitFor();
        await dmWebView.getByText('<outputItem>*').waitFor();

        console.log(' - Map roots using query expression');

        await dm.mapFields('input', 'arrayOutput.output', 'a2a-inner');
        await dmWebView.getByTestId('link-from-input.OUT-to-datamapper-intermediate-port').waitFor({ state: 'attached' });
        await dmWebView.getByTestId('link-from-datamapper-intermediate-port-to-queryOutput.output.Q#.IN').waitFor({ state: 'attached' });


        console.log(' - Map using query expression within focused view');
        await dm.mapFields('inputItem.iArr1D', 'queryOutput.output.oArr1D', 'a2a-inner');

        console.log(' - Map within inner focused view');
        await dm.mapFields('iArr1DItem.p2', 'queryOutput.oArr1D.p2', 'direct');
        const loc1 = dmWebView.getByTestId('link-from-iArr1DItem.p2.OUT-to-queryOutput.oArr1D.p2.IN');
        await dm.expectErrorLink(loc1);

        await dm.mapFields('iArr1DItem.p2', 'queryOutput.oArr1D.p1');
        await dm.mapFields('iArr1DItem.p3', 'queryOutput.oArr1D.p1');

        await dmWebView.getByTestId('link-from-iArr1DItem.p2.OUT-to-datamapper-intermediate-port').waitFor({ state: 'attached' });
        await dmWebView.getByTestId('link-from-iArr1DItem.p3.OUT-to-datamapper-intermediate-port').waitFor({ state: 'attached' });
        await dmWebView.getByTestId('link-from-datamapper-intermediate-port-to-queryOutput.oArr1D.p1.IN').waitFor({ state: 'attached' });

        const loc2 = dmWebView.getByTestId('link-connector-node-queryOutput.oArr1D.p1.IN');
        await loc2.waitFor();

        expect(await FileUtils.verifyFileContent(`array-root/${compDir}/map1.bal.txt`, projectFile)).toBeTruthy();

        console.log(' - Go back to intermediate focused view (using back button)');
        await dm.goPrevViewBackButton();
        const loc0 = dmWebView.getByTestId('link-connector-node-queryOutput.output.oArr1D.IN');
        await loc0.waitFor();

        console.log(' - Goto inner focused view again');
        await dmWebView.getByTestId('expand-array-fn-output.oArr1D').click();
        await dmWebView.getByTestId('link-from-inputItem.iArr1D.OUT-to-datamapper-intermediate-port').waitFor({ state: 'attached' });
        await dmWebView.getByTestId('link-from-datamapper-intermediate-port-to-queryOutput.oArr1D.Q#.IN').waitFor({ state: 'attached' });

        console.log(' - Delete within inner focused view');
        await loc1.click({ force: true });
        await dmWebView.getByTestId('expression-label-for-iArr1DItem.p2.OUT-to-queryOutput.oArr1D.p2.IN')
            .locator('.codicon-trash').click({ force: true });
        await loc1.waitFor({ state: 'detached' });

        await loc2.locator('.codicon-trash').click({ force: true });
        await loc2.waitFor({ state: 'detached' });

        expect(await FileUtils.verifyFileContent(`array-root/${compDir}/del1.bal.txt`, projectFile)).toBeTruthy();

        console.log(' - Map roots within inner focused view');
        await dm.mapFields('iArr1DItem', 'queryOutput.oArr1D', 'direct');
        const loc3 = dmWebView.getByTestId('link-from-iArr1DItem.OUT-to-queryOutput.oArr1D.IN');
        await loc3.waitFor();

        expect(await FileUtils.verifyFileContent(`array-root/${compDir}/map2.bal.txt`, projectFile)).toBeTruthy();

        console.log(' - Delete root mapping within inner focused view');
        await loc3.click({ force: true });
        await dmWebView.getByTestId('expression-label-for-iArr1DItem.OUT-to-queryOutput.oArr1D.IN')
            .locator('.codicon-trash').click({ force: true });
        await loc3.waitFor({ state: 'detached' });

        expect(await FileUtils.verifyFileContent(`array-root/${compDir}/del2.bal.txt`, projectFile)).toBeTruthy();

        console.log(' - Go back to intermediate focused view (using back button)');
        await dm.goPrevViewBackButton();

        console.log(' - Delete intermediate query expression');
        await loc0.locator('.codicon-trash').click({ force: true });
        await loc0.waitFor({ state: 'detached' });
        expect(await FileUtils.verifyFileContent(`array-root/${compDir}/del3.bal.txt`, projectFile)).toBeTruthy();


        console.log(' - Go back to root view (using breadcrumb)');
        await dm.goPrevViewBreadcrumb();

        const loc4 = dmWebView.getByTestId('link-connector-node-arrayOutput.output.IN');
        await loc4.waitFor();

        console.log(' - Delete root mapping');
        await loc4.locator('.codicon-trash').click({ force: true });
        await loc4.waitFor({ state: 'detached' });

        expect(await FileUtils.verifyFileContent(`array-root/${compDir}/del4.bal.txt`, projectFile)).toBeTruthy();

        console.log(' - Add element to root array using config menu');

        await dm.selectConfigMenuItem('arrayOutput.output', 'Add Element');
        await dm.waitForProgressEnd();
        await dmWebView.locator('div[id="recordfield-arrayOutput.output.0"]').waitFor();

        await dmWebView.getByTestId('array-widget-arrayOutput.output.IN-add-element').click();
        await dm.waitForProgressEnd();
        await dmWebView.locator('div[id="recordfield-arrayOutput.output.1"]').waitFor();

        console.log(' - Map to root array elements');
        await dm.expandField('input');
        await dm.mapFields('input', 'arrayOutput.output.0.oArr1D', 'a2a-direct');
        const loc5 = dmWebView.getByTestId('link-from-input.OUT-to-arrayOutput.output.0.oArr1D.IN');
        await dm.expectErrorLink(loc5);

        await dm.mapFields('input', 'arrayOutput.output.1.oArr1D', 'a2a-direct');
        await dm.expectErrorLink(dmWebView.getByTestId('link-from-input.OUT-to-arrayOutput.output.1.oArr1D.IN'));

        expect(await FileUtils.verifyFileContent(`array-root/${compDir}/map3.bal.txt`, projectFile)).toBeTruthy();

        console.log(' - Delete root array element mapping, entire element and entire root array');
        await loc5.click({ force: true });
        await dmWebView.getByTestId('expression-label-for-input.OUT-to-arrayOutput.output.0.oArr1D.IN')
            .locator('.codicon-trash').click({ force: true });
        await loc5.waitFor({ state: 'detached' });

        await dm.selectConfigMenuItem('arrayOutput.output.1', 'Delete Element');
        await dm.waitForProgressEnd();
        await dmWebView.locator('div[id="recordfield-arrayOutput.output.1"]').waitFor({ state: 'detached' });

        await dm.selectConfigMenuItem('arrayOutput.output', 'Delete Array');
        await dm.waitForProgressEnd();
        await dmWebView.getByText('<outputItem>*').waitFor();

        expect(await FileUtils.verifyFileContent(`array-root/${compDir}/del5.bal.txt`, projectFile)).toBeTruthy();

    }

}
