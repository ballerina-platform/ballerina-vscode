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

import { Prec, StateEffect, StateField } from "@codemirror/state";
import { EditorView, ViewPlugin, ViewUpdate, Tooltip, keymap, showTooltip } from "@codemirror/view";
import { FnSignatureDocumentation } from "@wso2/ui-toolkit";
import { extractTextContent } from "./CodeUtils";

export type FnSignature = {
    label: string;
    args: string[];
    currentArgIndex: number;
    documentation?: FnSignatureDocumentation;
};

type FetchSignature = (value: string, cursorPosition: number) => Promise<FnSignature | undefined>;

const setSignature = StateEffect.define<FnSignature | null>();

const summaryOf = (documentation?: FnSignatureDocumentation): string => {
    const text = extractTextContent(documentation?.fn).replace(/\*\*Description\*\*/i, "").trim();
    const paragraph = text.split(/\n\s*\n/)[0].replace(/\s+/g, " ");
    return paragraph.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? paragraph;
};

const render = (dom: HTMLElement, signature: FnSignature | null) => {
    if (!signature) {
        return;
    }
    const label = document.createElement("div");
    label.className = "cm-signature-hint-label";
    label.append(`${signature.label}(`);
    signature.args.forEach((arg, index) => {
        const span = document.createElement("span");
        span.textContent = arg;
        if (index === signature.currentArgIndex) {
            span.className = "cm-signature-hint-active";
        }
        label.append(...(index > 0 ? [", "] : []), span);
    });
    label.append(")");

    const summary = document.createElement("div");
    summary.className = "cm-signature-hint-summary";
    summary.textContent = summaryOf(signature.documentation);
    dom.replaceChildren(label, ...(summary.textContent ? [summary] : []));
};

type FieldOf = (view: EditorView) => HTMLElement | null;

// One tooltip object per editor, so moving between arguments rewrites the text instead of remounting it.
const signatureTooltip = (fieldOf: FieldOf): Tooltip => ({
    pos: 0,
    above: true,
    create: (view) => {
        const dom = document.createElement("div");
        dom.className = "cm-signature-hint";
        render(dom, view.state.field(signatureField));
        // Spans the whole field, so it sits above or below it, never over what is being typed.
        const field = () => (fieldOf(view) ?? view.dom).getBoundingClientRect();
        return {
            dom,
            offset: { x: 0, y: 4 },
            getCoords: field,
            mount: () => {
                dom.style.width = `${field().width}px`;
            },
            update: (update) => {
                if (update.startState.field(signatureField) !== update.state.field(signatureField)) {
                    render(dom, update.state.field(signatureField));
                }
            },
        };
    },
});

const signatureField = StateField.define<FnSignature | null>({
    create: () => null,
    update: (value, tr) => tr.effects.reduce((current, effect) => (effect.is(setSignature) ? effect.value : current), value),
});

const signatureTooltipOf = (fieldOf: FieldOf) => {
    const tooltip = signatureTooltip(fieldOf);
    return showTooltip.compute([signatureField], (state) => (state.field(signatureField) ? tooltip : null));
};

const signatureFetcher = (fetchSignature: FetchSignature) => ViewPlugin.fromClass(class {
    request = 0;

    constructor(private readonly view: EditorView) { }

    update(update: ViewUpdate) {
        const { main } = update.state.selection;
        const dismissed = update.transactions.some((tr) => tr.effects.some((e) => e.is(setSignature) && !e.value));
        if (dismissed) {
            this.request++;
        } else if (!update.view.hasFocus) {
            this.show(null);
        } else if (update.selectionSet || update.docChanged || update.focusChanged) {
            const request = ++this.request;
            fetchSignature(update.state.doc.toString(), main.head)
                .then((signature) => request === this.request && this.dispatch(signature ?? null))
                .catch(() => request === this.request && this.dispatch(null));
        }
    }

    // Hides at once and drops any answer still on its way; updates cannot dispatch, so it lands after this one.
    show(signature: FnSignature | null) {
        this.request++;
        queueMicrotask(() => this.dispatch(signature));
    }

    dispatch(signature: FnSignature | null) {
        if (this.view.state.field(signatureField) !== signature) {
            this.view.dispatch({ effects: setSignature.of(signature) });
        }
    }

    destroy() {
        this.request = -1;
    }
});

const dismissKeymap = Prec.high(keymap.of([{
    key: "Escape",
    run: (view) => {
        if (!view.state.field(signatureField)) {
            return false;
        }
        view.dispatch({ effects: setSignature.of(null) });
        return true;
    },
}]));

const signatureTheme = EditorView.baseTheme({
    ".cm-tooltip.cm-signature-hint": {
        boxSizing: "border-box",
        padding: "6px 10px",
        border: "1px solid var(--vscode-editorHoverWidget-border)",
        borderRadius: "var(--vscode-cornerRadius-medium, 6px)",
        backgroundColor: "var(--vscode-editorHoverWidget-background)",
        color: "var(--vscode-editorHoverWidget-foreground)",
        boxShadow: "0 4px 12px var(--vscode-widget-shadow)",
        fontSize: "12px",
        lineHeight: "18px",
        pointerEvents: "none",
        animation: "cm-signature-hint-in 120ms ease-out",
    },
    "@keyframes cm-signature-hint-in": {
        from: { opacity: 0 },
        to: { opacity: 1 },
    },
    ".cm-signature-hint-label": {
        fontFamily: "var(--vscode-editor-font-family)",
        color: "var(--vscode-descriptionForeground)",
        overflowWrap: "anywhere",
    },
    ".cm-signature-hint-active": {
        color: "var(--vscode-editorHoverWidget-highlightForeground, var(--vscode-textLink-foreground))",
        fontWeight: "600",
    },
    ".cm-signature-hint-summary": {
        marginTop: "2px",
    },
});

// Tooltips are positioned inside the form's scroll area, which clips them, so they must fit there rather than in the window.
export const scrollAreaSpace = (view: EditorView) => {
    for (let element = view.dom.parentElement; element; element = element.parentElement) {
        if (/(auto|scroll)/.test(getComputedStyle(element).overflowY)) {
            return element.getBoundingClientRect();
        }
    }
    return { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
};

/** Shows the call's parameters while the cursor sits inside its parentheses, with the current one highlighted. */
export const signatureHint = (fetchSignature: FetchSignature, fieldOf: FieldOf) =>
    [signatureField, signatureTooltipOf(fieldOf), signatureFetcher(fetchSignature), dismissKeymap, signatureTheme];
