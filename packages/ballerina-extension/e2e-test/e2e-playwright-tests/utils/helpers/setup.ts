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

import { downloadExtensionFromMarketplace, ExtendedPage, Form, startVSCode, switchToIFrame } from "@wso2/playwright-vscode-tester";
import { test } from '@playwright/test';
import fs, { existsSync } from 'fs';
import path from 'path';
import { execFileSync, execSync } from 'child_process';
import { getWebview } from './webview';
import { BI_INTEGRATOR_LABEL, BI_WEBVIEW_NOT_FOUND_ERROR, DEFAULT_PROJECT_FOLDER_NAME, DEFAULT_PROJECT_NAME } from './constants';
import { waitForBISidebarTreeView } from './sidebar';

/** Runtime test workspace lives under e2e-test/data (sibling of e2e-playwright-tests). */
export const dataFolder = path.join(__dirname, '..', '..', '..', 'data');
/** Template package committed with tests (minimal Ballerina project to copy). */
const emptyProjectPath = path.join(__dirname, '..', '..', 'data', 'empty_project');
export const extensionsFolder = path.join(__dirname, '..', '..', '..', '..', 'vsix');
const repoRootExtensionsFolder = path.join(__dirname, '..', '..', '..', '..', '..', '..', '..');
const vscodeVersion = '1.125.1';
const baseVsCodeProfileName = process.env.BI_E2E_PROFILE_NAME ?? `bi-test-profile-${process.pid}`;
let vscodeLaunchAttempt = 0;
export const resourcesFolder = path.join(__dirname, '..', '..', '..', 'test-resources');
const extensionsWorkRoot = path.join(resourcesFolder, 'extensions-install');
const marketplaceExtensionsFolder = path.join(extensionsWorkRoot, 'marketplace-cache');
const preExtensionId = 'WSO2.wso2-integrator';
export const newProjectPath = path.join(dataFolder, DEFAULT_PROJECT_FOLDER_NAME);
const snapshotsFolder = path.join(resourcesFolder, 'snapshots');
const screenshotsFolder = path.join(resourcesFolder, 'screenshots');
export let vscode: any;
export let page: ExtendedPage;

/**
 * Updated by afterEach to indicate whether the most recently finished test in
 * this worker failed/timed out/was interrupted. Currently informational —
 * the global afterAll in test.list.ts always tears down the Electron app so
 * the worker can exit (see comment there for why that is mandatory). Kept
 * exported because other modules may want to branch on last-test status.
 */
export let lastTestFailed = false;

/** Timeouts (ms) for defensive cleanup/recovery paths. Overridable via env. */
const SCREENSHOT_TIMEOUT_MS = Number(process.env.BI_E2E_SCREENSHOT_TIMEOUT_MS ?? 15000);
const RELOAD_TIMEOUT_MS = Number(process.env.BI_E2E_RELOAD_TIMEOUT_MS ?? 60000);
const POST_FAILURE_CLEANUP_TIMEOUT_MS = Number(process.env.BI_E2E_POST_FAILURE_CLEANUP_TIMEOUT_MS ?? 10000);

/**
 * Race `operation` against a timer. If the timer wins, throw with the provided
 * message so the caller can fall back to a recovery path instead of hanging.
 */
async function withTimeout<T>(operation: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
    let timeoutHandle: NodeJS.Timeout | undefined;
    try {
        return await Promise.race([
            operation,
            new Promise<never>((_, reject) => {
                timeoutHandle = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
            }),
        ]);
    } finally {
        if (timeoutHandle) clearTimeout(timeoutHandle);
    }
}

/**
 * Best-effort cleanup after a failed test: dismiss any open context menus /
 * modal dialogs and stop any active debug session so the next test starts
 * from a recoverable state. Bounded by a short timeout so a frozen page can
 * never stall the suite here.
 */
async function postFailureCleanup(currentPage?: ExtendedPage): Promise<void> {
    if (!currentPage?.page) return;
    try {
        await withTimeout((async () => {
            // Close any open context menu / palette / hover tooltip.
            for (let i = 0; i < 4; i++) {
                try { await currentPage.page.keyboard.press('Escape'); } catch { /* ignore */ }
            }
            // Stop any active debug session so it doesn't leak into the next test.
            try { await currentPage.page.keyboard.press('Shift+F5'); } catch { /* ignore */ }
        })(), POST_FAILURE_CLEANUP_TIMEOUT_MS, 'Post-failure cleanup timed out');
    } catch (err) {
        console.warn('  ⚠️  Post-failure cleanup did not complete cleanly:', (err as Error).message);
    }
}

/**
 * Zips the current test project directory so the source state can be inspected
 * after a failure. The archive is written to test-resources/snapshots/.
 */
export async function captureFailureScreenshot(testTitle: string): Promise<void> {
    if (!page?.page) {
        console.log('ℹ️  No active page, skipping screenshot capture');
        return;
    }
    try {
        fs.mkdirSync(screenshotsFolder, { recursive: true });
        const safeName = testTitle.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 120);
        const timestamp = new Date().toISOString().replace(/:/g, '-');
        const screenshotPath = path.join(screenshotsFolder, `${safeName}_${timestamp}.png`);
        await withTimeout(
            page.page.screenshot({ path: screenshotPath, fullPage: true, timeout: SCREENSHOT_TIMEOUT_MS }),
            SCREENSHOT_TIMEOUT_MS + 2000,
            `Screenshot capture timed out after ${SCREENSHOT_TIMEOUT_MS}ms`
        );
        console.log(`📸 Failure screenshot saved: ${screenshotPath}`);
    } catch (error) {
        console.warn('⚠️  Failed to capture screenshot:', (error as Error).message);
    }
}

export function zipProjectSnapshot(testTitle: string): void {
    if (!fs.existsSync(newProjectPath)) {
        console.log('ℹ️  Test project directory does not exist, skipping snapshot');
        return;
    }
    try {
        fs.mkdirSync(snapshotsFolder, { recursive: true });
        const safeName = testTitle.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 120);
        const timestamp = new Date().toISOString().replace(/:/g, '-');
        const zipFileName = `${safeName}_${timestamp}.zip`;
        const zipFilePath = path.join(snapshotsFolder, zipFileName);
        execSync(`zip -r "${zipFilePath}" "${DEFAULT_PROJECT_FOLDER_NAME}"`, {
            cwd: dataFolder,
            timeout: 30000,
        });
        console.log(`📦 Project snapshot saved: ${zipFilePath}`);
    } catch (error) {
        console.warn('⚠️  Failed to save project snapshot:', error);
    }
}

function getVsCodeProfileName(): string {
    if (process.env.BI_E2E_PROFILE_NAME) {
        return process.env.BI_E2E_PROFILE_NAME;
    }
    vscodeLaunchAttempt += 1;
    return `${baseVsCodeProfileName}-${vscodeLaunchAttempt}`;
}

function resolveBallerinaVsixPath(): string {
    const candidateFolders = [extensionsFolder, repoRootExtensionsFolder];
    const findVsixFiles = () => candidateFolders.filter((folder) => fs.existsSync(folder)).flatMap((folder) => fs.readdirSync(folder)
        .filter((file) => /^ballerina-.*\.vsix$/i.test(file) && !/^ballerina-integrator-/i.test(file))
        .map((file) => ({
            file,
            fullPath: path.join(folder, file),
            mtime: fs.statSync(path.join(folder, file)).mtimeMs,
        })))
        .sort((a, b) => b.mtime - a.mtime);

    let ballerinaVsixFiles = findVsixFiles();
    if (ballerinaVsixFiles.length === 0) {
        console.log('No local Ballerina VSIX found; running "rush build -t ballerina"');
        execSync('rush build -t ballerina', {
            cwd: repoRootExtensionsFolder,
            stdio: 'inherit',
            timeout: 60 * 60 * 1000,
        });
        ballerinaVsixFiles = findVsixFiles();
    }

    if (ballerinaVsixFiles.length === 0) {
        throw new Error(`No local Ballerina VSIX found in: ${candidateFolders.join(', ')} after running "rush build -t ballerina".`);
    }

    return ballerinaVsixFiles[0].fullPath;
}

async function prepareExtensionsForLaunch(profileName: string): Promise<string> {
    fs.mkdirSync(extensionsWorkRoot, { recursive: true });
    fs.mkdirSync(marketplaceExtensionsFolder, { recursive: true });

    // Ensure marketplace prerequisite VSIX is available locally.
    await downloadExtensionFromMarketplace(preExtensionId, marketplaceExtensionsFolder, true);

    const launchExtensionsFolder = path.join(extensionsWorkRoot, profileName);
    if (fs.existsSync(launchExtensionsFolder)) {
        fs.rmSync(launchExtensionsFolder, { recursive: true, force: true });
    }
    fs.mkdirSync(launchExtensionsFolder, { recursive: true });

    const ballerinaVsix = resolveBallerinaVsixPath();
    fs.copyFileSync(ballerinaVsix, path.join(launchExtensionsFolder, path.basename(ballerinaVsix)));

    const prereqVsix = fs.readdirSync(marketplaceExtensionsFolder)
        .find((file) => /^wso2-integrator-.*\.vsix$/i.test(file));
    if (!prereqVsix) {
        throw new Error(`Prerequisite VSIX for ${preExtensionId} not found in: ${marketplaceExtensionsFolder}`);
    }
    fs.copyFileSync(
        path.join(marketplaceExtensionsFolder, prereqVsix),
        path.join(launchExtensionsFolder, prereqVsix)
    );

    return launchExtensionsFolder;
}

/**
 * Pre-pulls Ballerina Central packages into the local cache before project creation/tests run.
 * Originally added to work around "Language server has stopped working due to unresolved
 * modules in your project" (temporary until Ballerina 2201.13.0); also used by test suites
 * (e.g. project-explorer) to warm non-bundled connector packages, since a cold Central cache
 * on a fresh CI runner otherwise stalls the language server's semantic model resolution.
 * `bal pull` is idempotent - a package that's already cached prints "Package already exists."
 * and exits 0 - so this is a fast no-op on a warm developer cache.
 */
export function executeBallPullCommand(modules: string[] = ['ballerina/task:2.7.0']): void {
    for (const module of modules) {
        console.log(`Executing bal pull ${module}...`);
        try {
            execFileSync('bal', ['pull', module], { stdio: 'pipe', timeout: 180000 });
            console.log(`✓ Successfully executed bal pull ${module}`);
        } catch (err) {
            const details = err as { stdout?: unknown; stderr?: unknown; message?: string };
            const output = `${details.stdout ?? ''}${details.stderr ?? ''}`;
            // A non-zero exit for an already-cached package is expected on some
            // distributions; only surface genuinely unexpected failures.
            if (!/already exists/i.test(output)) {
                console.warn(`  ⚠️  Failed to pre-pull ${module}: ${output || details.message}`);
            }
        }
    }
}

async function initVSCode(workspacePath: string = newProjectPath) {
    if (vscode && page) {
        await page.executePaletteCommand('Reload Window');
    } else {
        const profileName = getVsCodeProfileName();
        const launchExtensionsFolder = await prepareExtensionsForLaunch(profileName);
        vscode = await startVSCode(
            resourcesFolder,
            vscodeVersion,
            undefined,
            false,
            launchExtensionsFolder,
            workspacePath,
            profileName
        );
    }
    page = new ExtendedPage(await vscode!.firstWindow({ timeout: 60000 }));
}

/**
 * Re-acquire the current VS Code window into the shared `page` binding.
 *
 * The BI extension can trigger a `workbench.action.reloadWindow` while it
 * finishes activation (e.g. its distribution setup flow). That closes the
 * Electron page a test is currently driving, surfacing as
 * "Target page, context or browser has been closed". This helper grabs the
 * fresh window the reload produced so the caller can retry against it, mirroring
 * how the initTest reload path re-acquires `page`. Returns true if a live window
 * was obtained.
 */
export async function reacquireWindow(timeout: number = 60000): Promise<boolean> {
    if (!vscode) {
        return false;
    }
    page = new ExtendedPage(await vscode.firstWindow({ timeout }));
    await page.page.waitForLoadState();
    return true;
}

async function resumeVSCode() {
    if (vscode && page) {
        await page.executePaletteCommand('Reload Window');
    } else {
        console.log('Starting VSCode');
        const profileName = getVsCodeProfileName();
        const launchExtensionsFolder = await prepareExtensionsForLaunch(profileName);
        vscode = await startVSCode(
            resourcesFolder,
            vscodeVersion,
            undefined,
            false,
            launchExtensionsFolder,
            newProjectPath,
            profileName
        );
        await new Promise(resolve => setTimeout(resolve, 5000));
    }
    page = new ExtendedPage(await vscode!.firstWindow({ timeout: 60000 }));
}

function resetTestProjectFromTemplate(templatePath: string = emptyProjectPath): void {
    if (!existsSync(templatePath)) {
        throw new Error(`Project template not found: ${templatePath}`);
    }

    if (fs.existsSync(newProjectPath)) {
        fs.rmSync(newProjectPath, { recursive: true, force: true });
    }

    fs.cpSync(templatePath, newProjectPath, { recursive: true, force: true });
}

/**
 * Aggressively dismiss any blocking modal dialog that VS Code might have raised
 * (save-conflict, file-changed-on-disk, dirty-editor confirmation, etc.).
 *
 * Context: after resetting the project folder from the template, any editor tabs
 * from the previous test reference files whose on-disk content has just been
 * replaced. The first save/close attempt hits VS Code's modal:
 *   "The content of the file is newer. Do you want to overwrite... or revert?"
 * ...which silently blocks automation. We defensively click the discard-side
 * button so the test can proceed instead of hanging.
 */
async function dismissBlockingModalDialog(currentPage: ExtendedPage): Promise<void> {
    const discardButtonLabels = [
        "Don't Save",
        'Discard Changes',
        'Revert',
        'Revert File',
        'Use Disk Version',
        'Overwrite',
        'Reload',
        'OK',
    ];
    for (const label of discardButtonLabels) {
        try {
            const btn = currentPage.page.getByRole('button', { name: label, exact: true }).first();
            if (await btn.isVisible({ timeout: 250 })) {
                console.log(`  ⚠️  Dismissing VS Code modal via "${label}"`);
                await btn.click({ timeout: 1500 });
                await currentPage.page.waitForTimeout(300);
                return;
            }
        } catch { /* no-op — try next label */ }
    }
}

/**
 * Close every open editor tab WITHOUT triggering a save-conflict prompt.
 *
 * Strategy:
 *   1. Kill all terminals (they can hold project files on Windows and also tend
 *      to surface their own confirmation prompts).
 *   2. Loop `workbench.action.revertAndCloseActiveEditor` until no editor tabs
 *      remain. This command discards the in-memory buffer and closes the tab
 *      in a single atomic step, so VS Code never compares it against disk.
 *   3. If an editor refuses to revert (e.g. webview panels), fall back to
 *      `workbench.action.closeActiveEditor` plus a modal-button dismiss.
 *   4. Final safety net: `workbench.action.closeAllEditors` + modal dismiss.
 */
async function discardAndCloseAllEditors(currentPage: ExtendedPage): Promise<void> {
    await currentPage.page.keyboard.press('Escape');
    await currentPage.page.keyboard.press('Escape');

    try {
        await currentPage.executePaletteCommand('Terminal: Kill All Terminals');
        await currentPage.page.waitForTimeout(400);
    } catch { /* no terminals open */ }
    await currentPage.page.keyboard.press('Escape');
    await currentPage.page.keyboard.press('Escape');

    // Editor tabs live under the editor part's tabs container. This selector
    // avoids matching panel/terminal tabs.
    const editorTabSelector = '.part.editor .tabs-container .tab';
    const MAX_CLOSE_ITERATIONS = 100;

    for (let i = 0; i < MAX_CLOSE_ITERATIONS; i++) {
        const tabCount = await currentPage.page.locator(editorTabSelector).count();
        if (tabCount === 0) {
            break;
        }

        try {
            await currentPage.executePaletteCommand('workbench.action.revertAndCloseActiveEditor');
        } catch { /* command not available for current editor type */ }
        await currentPage.page.waitForTimeout(150);

        // Some editor types (webview, custom editors) can't revert — close them forcibly.
        if (await currentPage.page.locator(editorTabSelector).count() === tabCount) {
            try {
                await currentPage.executePaletteCommand('workbench.action.closeActiveEditor');
                await currentPage.page.waitForTimeout(150);
            } catch { /* ignore */ }
            await dismissBlockingModalDialog(currentPage);
        }

        // If a conflict dialog surfaced despite revert, clear it and try again.
        await dismissBlockingModalDialog(currentPage);
    }

    try {
        await currentPage.executePaletteCommand('workbench.action.closeAllEditors');
        await currentPage.page.waitForTimeout(500);
        await dismissBlockingModalDialog(currentPage);
    } catch { /* nothing left to close */ }
}

export async function toggleNotifications(disable: boolean) {
    const notificationStatus = page.page.locator('#status\\.notifications');
    await notificationStatus.waitFor();
    const ariaLabel = await notificationStatus.getAttribute('aria-label');
    if ((ariaLabel !== "Do Not Disturb" && disable) || (ariaLabel === "Do Not Disturb" && !disable)) {
        console.log("Toggling notifications");
        await page.executePaletteCommand("Notifications: Toggle Do Not Disturb Mode");
        console.log("Toggled notifications");
    }
    console.log("Finished");
}

export async function setupBallerinaIntegrator() {
    await waitForBISidebarTreeView(page);
    console.log('BI sidebar tree view is available');
    let webview;
    try {
        webview = await switchToIFrame(BI_INTEGRATOR_LABEL, page.page, 20000);
    } catch (error) {
        console.log('Failed to get webview on first attempt, retrying...');
        await waitForBISidebarTreeView(page);
        webview = await getWebview(BI_INTEGRATOR_LABEL, page);
    }
    if (!webview) {
        throw new Error(BI_WEBVIEW_NOT_FOUND_ERROR);
    }
    const txt = webview.locator(`text=${BI_INTEGRATOR_LABEL} for VS`);
    await txt.waitFor({ timeout: 30000 });
    const createNewIntegrationBtn = webview.getByRole('button', { name: 'Create New Integration' });
    try {
        // Check if 'Create New Integration' button exists
        await createNewIntegrationBtn.waitFor({ timeout: 1000 });
        console.log('Found Create New Integration button, clicking it');
        await createNewIntegrationBtn.click({ force: true });
    } catch (error) {
        console.log('Create New Integration button not found, will use Set up Ballerina distribution button');
        const setupButton = webview.getByRole('button', { name: 'Set up Ballerina distribution' });
        await setupButton.waitFor();
        await setupButton.click({ force: true });
        const restartButton = webview.getByRole('button', { name: 'Restart VS Code' });
        await restartButton.waitFor({ timeout: 600000 });
        await resumeVSCode();
        await setupBallerinaIntegrator();
    }
}

export async function createProject(page: ExtendedPage, projectName?: string) {
    console.log('Creating new project');

    await setupBallerinaIntegrator();
    const webview = await getWebview(BI_INTEGRATOR_LABEL, page);
    if (!webview) {
        throw new Error(BI_WEBVIEW_NOT_FOUND_ERROR);
    }
    const form = new Form(page.page, BI_INTEGRATOR_LABEL, webview);
    await form.switchToFormView(false, webview);
    await form.fill({
        values: {
            'Integration Name*': {
                type: 'input',
                value: projectName ?? DEFAULT_PROJECT_NAME,
            },
            'Select Path': {
                type: 'directory',
                value: newProjectPath
            }
        }
    });
    await form.submit('Create Integration');
    const artifactWebView = await getWebview(BI_INTEGRATOR_LABEL, page);
    if (!artifactWebView) {
        throw new Error(BI_WEBVIEW_NOT_FOUND_ERROR);
    }
    const integrationName = artifactWebView.locator(`text=${projectName ?? DEFAULT_PROJECT_NAME}`);
    await integrationName.waitFor({ timeout: 200000 });
}

export function initTest(newProject: boolean = true, skipProjectCreation: boolean = true, cleanupAfter?: boolean, projectName?: string, templatePath?: string) {
    test.beforeAll(async ({ }, testInfo) => {
        console.log(`\n▶️  STARTING TEST: ${testInfo.title} (Attempt ${testInfo.retry + 1})`);

        const wipeAndRecreateDataFolder = (): void => {
            if (fs.existsSync(dataFolder)) {
                fs.rmSync(dataFolder, { recursive: true, force: true });
            }
            // Read/write/execute for all files and folders in the data folder
            fs.mkdirSync(dataFolder, { recursive: true, mode: 0o777 });
        };

        if (!vscode || !page) {
            wipeAndRecreateDataFolder();
            if (newProject) {
                console.log('  🧹 Resetting test project from template');
                resetTestProjectFromTemplate(templatePath);
            }
            console.log('  📦 Starting VSCode...');
            await initVSCode(newProject ? newProjectPath : dataFolder);
        } else {
            // IMPORTANT: when reusing an existing VS Code window, we MUST close
            // editors BEFORE wiping the project folder from disk. Otherwise
            // VS Code sees the open buffers as out-of-sync with the freshly
            // written template files and throws a modal save-conflict dialog
            // ("The content of the file is newer. Overwrite / Revert / Compare")
            // which silently hangs the test. The previous ordering wiped disk
            // first and then tried to `saveFiles`, which is exactly the path
            // that triggers the dialog.
            console.log('  🔄 Reloading VS Code after project reset...');
            try {
                await discardAndCloseAllEditors(page);
            } catch (err) {
                console.warn('  ⚠️  Failed to fully close editors before reset:', err);
                await dismissBlockingModalDialog(page);
            }

            wipeAndRecreateDataFolder();

            if (newProject) {
                console.log('  🧹 Resetting test project from template');
                resetTestProjectFromTemplate(templatePath);
            }

            // Wrap the soft-reload path in a timeout. If anything in the chain
            // (palette command, window re-acquisition, sidebar wait) stalls,
            // throw — Playwright will discard this worker and start a fresh
            // one, which will re-launch VS Code cleanly via the `!vscode`
            // branch above. The global afterAll in test.list.ts will close
            // Electron during worker teardown so the worker can exit.
            await withTimeout((async () => {
                await page.executePaletteCommand('Reload Window');
                await page.page.waitForTimeout(3000);
                page = new ExtendedPage(await vscode!.firstWindow({ timeout: 60000 }));
                await page.page.waitForLoadState();
                await page.page.waitForTimeout(5000);
                console.log('  ⏳ Waiting for BI extension to initialize after reload...');
                await waitForBISidebarTreeView(page);
            })(), RELOAD_TIMEOUT_MS, `Reload Window did not complete within ${RELOAD_TIMEOUT_MS}ms`);
            console.log('  ✅ BI extension ready after reload');
        }
        await toggleNotifications(true);
        // Skip the github popup if there is any
        try {
            const welcomePopup = page.page.locator('text=Welcome to VS Code');
            await welcomePopup.waitFor({ timeout: 3000 });
            const skipButton = page.page.getByRole('button', { name: 'Skip' });
            await skipButton.click();
            console.log('Skipped github popup');
        } catch {
            console.log('No github popup found');
        }

        if (!skipProjectCreation) {
            await createProject(page, projectName);
        }
        console.log('  ✅ Test environment ready');
    });

    test.afterEach(async ({ }, testInfo) => {
        const status = testInfo.status ?? 'skipped';
        lastTestFailed = status === 'failed' || status === 'timedOut' || status === 'interrupted';
        const statusEmoji = status === 'passed' ? '✅' : status === 'failed' ? '❌' : '⏭️';
        console.log(`${statusEmoji} FINISHED TEST: ${testInfo.title} (${status.toUpperCase()}, Attempt ${testInfo.retry + 1})\n`);
        if (lastTestFailed) {
            // Do NOT close the Electron app here (per-test afterEach). The
            // global afterAll in test.list.ts handles Electron teardown once
            // the worker is being discarded; closing it per-test would kill
            // VS Code between tests that are supposed to share state.
            const pageAlive = !!page?.page && !page.page.isClosed?.();
            if (pageAlive) {
                await captureFailureScreenshot(testInfo.title);
                // Best-effort: dismiss menus / stop debug session. Bounded by
                // a short timeout so a frozen page can't stall teardown.
                await postFailureCleanup(page);
            } else {
                console.log('  ℹ️  Page already closed, skipping screenshot/cleanup');
            }
            zipProjectSnapshot(testInfo.title);
        }
    });
}

export function initMigrationTest() {
    test.beforeAll(async ({ }, testInfo) => {
        console.log(`>>> Starting migration tests. Title: ${testInfo.title}, Attempt: ${testInfo.retry + 1}`);
        console.log('Setting up BI extension for migration testing');
        fs.mkdirSync(dataFolder, { recursive: true });
        if (!existsSync(newProjectPath)) {
            resetTestProjectFromTemplate();
            console.log('Starting VSCode');
        } else {
            console.log('Resuming VSCode');
            await resumeVSCode();
            await page.page.waitForLoadState();
            await toggleNotifications(true);
        }
        await initVSCode();
        await page.page.waitForLoadState();
        await toggleNotifications(true);

        // Reload VS Code to apply the language server setting
        await page.executePaletteCommand('Reload Window');
        await page.page.waitForLoadState();
        await page.page.waitForTimeout(5000); // Give VS Code time to fully reload

        // Ensure BI sidebar tree view is available before navigating to Import External Integration
        await waitForBISidebarTreeView(page);
        const webview = await getWebview(BI_INTEGRATOR_LABEL, page);
        if (!webview) {
            throw new Error(BI_WEBVIEW_NOT_FOUND_ERROR);
        }
        console.log('Migration test runner started');
    });

    test.afterEach(async ({ }, testInfo) => {
        const status = testInfo.status ?? 'skipped';
        lastTestFailed = status === 'failed' || status === 'timedOut' || status === 'interrupted';
        const statusEmoji = status === 'passed' ? '✅' : status === 'failed' ? '❌' : '⏭️';
        console.log(`${statusEmoji} FINISHED MIGRATION TEST: ${testInfo.title} (${status.toUpperCase()}, Attempt ${testInfo.retry + 1})\n`);
        if (lastTestFailed) {
            const pageAlive = !!page?.page && !page.page.isClosed?.();
            if (pageAlive) {
                await captureFailureScreenshot(testInfo.title);
                await postFailureCleanup(page);
            }
            zipProjectSnapshot(testInfo.title);
        }
    });
}
