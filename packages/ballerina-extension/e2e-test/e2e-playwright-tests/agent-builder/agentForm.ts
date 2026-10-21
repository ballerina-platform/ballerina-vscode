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
import { expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import type { Frame, Locator } from '@playwright/test';
import { AGENT_BUILDER_LABEL, getWebview, newProjectPath, page, reacquireWindow } from '../utils/helpers';

// Shared by the Agent Builder journeys. The BI forms are not plain HTML — fields are web
// components or CodeMirror editors and submits are `vscode-button`s — so every journey needs
// the same handful of accessors. They live here rather than in `utils/helpers` because
// nothing outside this folder drives these forms.

export const AGENT_BUILDER_MODE = 'agent-builder';

/** A genuinely empty integration; the shared `empty_project` seeds an automation. */
export const EMPTY_PROJECT_TEMPLATE = path.join(__dirname, '..', 'data', 'automation_creation_project');

/**
 * Finds a form control by its visible label.
 *
 * A field may be a `vscode-text-field` whose <input> lives in a shadow root, or a CodeMirror
 * expression editor with no input at all, so `getByRole('textbox')` alone misses them.
 * Accessible names also run the label, the required marker and the description together
 * ("Name*Unique name..."), hence the prefix match.
 */
export function field(scope: Frame, label: string): Locator {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const accessible = new RegExp(`^\\s*${escaped}\\*?(?=$|[A-Z(\\[])`, 'i');
    const byRole = scope.getByRole('textbox', { name: accessible })
        .or(scope.getByRole('combobox', { name: accessible }));
    const caseless = `translate(normalize-space(translate(., '*', '')), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz')='${label.toLowerCase()}'`;
    const labelNode = scope.locator(`xpath=.//*[not(self::script) and not(self::style) and (${caseless})][not(.//*[${caseless}])]`).first();
    const controls = 'self::input or self::textarea or self::vscode-text-field or self::vscode-text-area or @role="combobox" or @role="textbox" or contains(@class,"cm-content")';
    const byLabel = labelNode
        .locator(`xpath=ancestor::*[.//*[${controls}]][1]`)
        .locator(`xpath=.//*[${controls}]`)
        .first();
    return byRole.or(byLabel).first();
}

/** The visible field labels of a form, for the error message when one is not found. */
async function labelsIn(scope: Frame): Promise<string[]> {
    return scope.evaluate(() =>
        Array.from(document.querySelectorAll('label, [class*="abel"]'))
            .map((e) => (e.textContent ?? '').replace(/\s+/g, ' ').trim())
            .filter((t) => t.length > 0 && t.length < 80));
}

/** Types into a control found by label, handling the web-component and CodeMirror cases. */
export async function fillField(scope: Frame, label: string, value: string): Promise<void> {
    let input = field(scope, label);
    try {
        await input.waitFor({ timeout: 60000 });
    } catch {
        // These labels come from language-server node templates, so they move without any
        // change here. Naming what the form actually offers turns a bare timeout into a fix.
        throw new Error(`No control labelled "${label}". The form offers: ${(await labelsIn(scope)).join(' | ')}`);
    }
    // A form can re-render while a package is pulled, detaching the control between locating
    // it and reading it. Re-resolve once rather than failing the journey over a repaint.
    const classify = (locator: Locator) => locator.evaluate((e) =>
        (e.classList.contains('cm-content') || e.closest('.cm-editor')) ? 'cm' : e.tagName.toLowerCase());
    let kind: string;
    try {
        kind = await classify(input);
    } catch {
        await page.page.waitForTimeout(3000);
        input = field(scope, label);
        await input.waitFor({ timeout: 60000 });
        kind = await classify(input);
    }
    if (kind === 'vscode-text-field' || kind === 'vscode-text-area') {
        input = input.locator('input, textarea').first();
    }
    if (kind === 'cm') {
        // An expression editor re-renders on focus and drops keystrokes, so insert in one event.
        await input.click();
        await input.evaluate((e, text) => {
            e.textContent = text;
            e.dispatchEvent(new InputEvent('input', { bubbles: true, data: text }));
        }, value);
    } else {
        await input.click();
        await input.fill('');
        await input.pressSequentially(value);
    }
    // Each prompt field opens a helper panel over the next control, so dismiss it before
    // moving on or the following text lands in the helper instead of the field.
    await page.page.keyboard.press('Escape');
}

/** Clicks a form's submit, which is a `vscode-button` rather than a <button>. */
export async function submitForm(scope: Frame, text: RegExp): Promise<void> {
    // Matched without anchors because the text carries surrounding whitespace, and `last()`
    // because the view behind the popup can hold a card with the same words.
    const submit = scope.locator('vscode-button').filter({ hasText: text }).last();
    await submit.waitFor({ timeout: 60000 });
    // Identifier fields validate on blur and the submit stays disabled until they have, so a
    // click sent the moment the last field is typed is swallowed and the form just sits there.
    await expect.poll(() => submit.getAttribute('disabled'), { timeout: 60000 }).toBeNull();
    await page.page.waitForTimeout(500);
    await submit.click({ force: true });
}

/**
 * Every .bal file in the project, concatenated.
 *
 * Which file a declaration lands in is the generator's choice, so asserting against a single
 * file would make a journey fail on a placement change that broke nothing.
 */
export function projectSource(): string {
    if (!fs.existsSync(newProjectPath)) {
        return '';
    }
    return fs.readdirSync(newProjectPath)
        .filter((f) => f.endsWith('.bal'))
        .map((f) => fs.readFileSync(path.join(newProjectPath, f), 'utf8'))
        .join('\n');
}

/**
 * Waits until `marker` is in source and the generator has stopped rewriting it.
 *
 * The marker appearing is not the end of the write: the generator comes back to add imports
 * and reformat, and a read taken in that window sees a half-written — sometimes empty — file.
 * So wait for two identical reads before trusting what is on disk.
 *
 * Pass the marker a caller is about to assert on, not something that merely shows up along
 * the way. One action can produce several writes — adding a tool writes the tool's function
 * before registering it on the agent — and waiting for the first leaves a caller asserting
 * the second against a settled-looking file that does not have it yet. A loaded CI runner
 * pauses between those writes for longer than the stability window, so a marker that is too
 * early passes locally and fails there.
 */
export async function settledSource(marker: string | RegExp, timeout = 120000): Promise<string> {
    const matches = (source: string) =>
        typeof marker === 'string' ? source.includes(marker) : marker.test(source);
    // toMatch rather than a boolean poll so a timeout prints the source that fell short.
    await expect.poll(projectSource, { timeout, intervals: [1000] }).toMatch(marker);
    let previous = '';
    await expect.poll(() => {
        const current = projectSource();
        const stable = current === previous && matches(current);
        previous = current;
        return stable;
    }, { timeout: 60000, intervals: [1000] }).toBe(true);
    return previous;
}

/**
 * Opens the add-agent gallery from the overview's empty state.
 *
 * The empty state offers the Copilot prompt first and this as the "or" route; the prompt path
 * needs a signed-in assistant, which an automated run does not have.
 */
export async function openAddAgentGallery(): Promise<Frame> {
    const overview = await getWebview(AGENT_BUILDER_LABEL, page);
    if (!overview) {
        throw new Error(`${AGENT_BUILDER_LABEL} webview not found`);
    }
    const addManually = overview.getByRole('button', { name: /Add an agent manually/i });
    // The empty state only renders once the language server has loaded the project, which on
    // a cold start — a freshly installed extension, no package cache — is minutes, not seconds.
    await addManually.waitFor({ timeout: 180000 });
    await addManually.click({ force: true });
    return getWebview(AGENT_BUILDER_LABEL, page);
}

/** Clicks one of the "Create New" cards in the add-agent gallery. */
export async function chooseGalleryCard(gallery: Frame, title: string): Promise<Frame> {
    const card = gallery.getByText(title, { exact: true }).first();
    await card.waitFor({ timeout: 60000 });
    await card.click({ force: true });
    return getWebview(AGENT_BUILDER_LABEL, page);
}

/**
 * The visible text of the side panel, for the error message when a step is not found.
 *
 * Only the panel: a step that opens a modal instead is rendered without any stable hook, so
 * such a step waits for a control of the view it expects (`waitForButton`) rather than for
 * text to change.
 */
export async function panelText(scope: Frame): Promise<string> {
    return scope.evaluate(() => {
        const panel = document.querySelector('[data-testid="side-panel"]') ?? document.body;
        return (panel.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 1500);
    });
}

/**
 * Clicks an entry in the side panel by its visible text.
 *
 * The wizard's entries come from the language server's library index, so what it lists moves
 * without any change here. Naming what the panel actually offered turns a bare timeout into
 * a fix.
 */
export async function chooseInPanel(scope: Frame, name: string | RegExp): Promise<void> {
    const entry = typeof name === 'string'
        ? scope.getByText(name, { exact: true }).first()
        : scope.getByText(name).first();
    try {
        await entry.waitFor({ state: 'visible', timeout: 60000 });
    } catch {
        throw new Error(`No panel entry matching ${name}. The panel offers: ${await panelText(scope)}`);
    }
    await entry.scrollIntoViewIfNeeded();
    await page.page.waitForTimeout(500);
    await entry.click({ force: true });
}

/**
 * Waits for the side panel to finish loading.
 *
 * The library wizards fetch from Ballerina Central the first time they open, and show a
 * loader in place of their list while they do, so a step that reads the panel straight after
 * opening it reads the loader. One of those loaders carries no message at all, leaving the
 * panel header as its only text, so a header-length panel counts as still loading too.
 */
const PANEL_HEADER_ONLY = 80;

export async function waitForPanelReady(scope: Frame, previous?: string, timeout = 180000): Promise<string> {
    let text = '';
    await expect.poll(async () => {
        text = await panelText(scope);
        const loading = /Fetching resources|Loading|Pulling/i.test(text) || text.length < PANEL_HEADER_ONLY;
        // A wizard step whose next view is slow to load still shows the step just left, so a
        // caller that knows what it is leaving passes it and waits for the panel to move on.
        return loading || (previous !== undefined && text === previous);
    }, { timeout, intervals: [2000] }).toBe(false);
    return text;
}

/**
 * Clicks a button by its accessible name.
 *
 * Used for the wizard steps that open a modal. The modal carries no stable hook — only
 * generated class names — so a step that opens one waits for a control of the view it
 * expects rather than for the modal itself.
 */
export async function clickButton(scope: Frame, name: RegExp): Promise<void> {
    const button = scope.getByRole('button', { name }).first();
    try {
        await button.waitFor({ state: 'visible', timeout: 60000 });
    } catch {
        throw new Error(`No button matching ${name}. The buttons are: ${(await buttonNames(scope)).join(' | ')}`);
    }
    await button.scrollIntoViewIfNeeded();
    await button.click();
}

/** Waits for a control that marks the view the last step was expected to open. */
export async function waitForButton(scope: Frame, name: RegExp, timeout = 120000): Promise<void> {
    try {
        await scope.getByRole('button', { name }).first().waitFor({ state: 'visible', timeout });
    } catch {
        throw new Error(`Never reached a view with ${name}. The buttons are: ${(await buttonNames(scope)).join(' | ')}`);
    }
}

/** The accessible names of the buttons on screen, for the error message when one is missing. */
export async function buttonNames(scope: Frame): Promise<string[]> {
    return scope.evaluate(() =>
        Array.from(document.querySelectorAll<HTMLElement>('button, vscode-button, [role="button"]'))
            .filter((e) => e.getBoundingClientRect().width > 0)
            .map((e) => (e.getAttribute('aria-label') ?? e.textContent ?? '').replace(/\s+/g, ' ').trim())
            .filter((t) => t.length > 0 && t.length < 60));
}

/**
 * Reloads the window and returns the Agent Builder view in the window that comes back.
 *
 * A reload destroys the Electron window the test is driving, so anything still holding the
 * old one fails with "Target page, context or browser has been closed". `reacquireWindow`
 * replaces the shared `page` with the fresh window, the same way the initTest reload path does.
 */
export async function reloadWindow(): Promise<Frame> {
    await page.executePaletteCommand('Reload Window');
    await page.page.waitForTimeout(3000);
    if (!await reacquireWindow()) {
        throw new Error('No VS Code window after Reload Window');
    }
    await page.page.waitForTimeout(5000);
    return getWebview(AGENT_BUILDER_LABEL, page);
}
