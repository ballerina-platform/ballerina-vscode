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

import React, { createContext, Dispatch, ReactNode, SetStateAction, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { getFieldTypeLabel, Imports } from "@wso2/ballerina-core";
import { useOptionalFieldContext } from "../components/editors/FieldContext";
import { useAssistKey, useFormContext } from "./form";
import { FormField } from "../components/Form/types";
import { FieldAssistContext } from "../components/editors/FieldAssist/FieldAssist";
import { useAssistHost } from "../components/editors/FieldAssist/AssistHost";

export interface InsertTarget {
    id: symbol;
    label: string;
    // The field's expected Ballerina type, so the browser can rank values that fit it first.
    expectedType?: string;
    // Words that say what the value is for (a variable's name), so values named like it rank first.
    nameHint?: string;
    insert: (value: string) => void;
    addImports: (imports: Imports) => void;
    // Opens the field's Copilot with the given request in its prompt; unset where the field has no Copilot.
    askCopilot?: (draft: string) => void;
}

export interface InsertTargetContextType {
    target: InsertTarget | null;
    setTarget: Dispatch<SetStateAction<InsertTarget | null>>;
    // The browser beside the form, for editors that open over it (the expanded editor).
    browser?: ReactNode;
    // Set while the browser is folded away; a field's button calls it to bring the browser back.
    showBrowser?: () => void;
    // Opens the value picker under the given field.
    openPicker?: (anchor: HTMLElement) => void;
    // The field the open value picker sits under, so its button shows as pressed.
    pickerAnchor?: HTMLElement | null;
    // The project's configurables, for fields that should hold one instead of a literal secret.
    configurables?: Configurables;
}

export interface ConfigurableSeed {
    name: string;
    type: string;
    documentation?: string;
    // The value for Config.toml, e.g. a secret moved out of the code.
    value?: string;
}

// Marks the New Configurable form's value field, which takes the secret as plain text, masked.
export const SECRET_VALUE = "SECRET_VALUE";

export interface Configurables {
    list: (type: string) => Promise<string[]>;
    // Opens the New Configurable form filled from the seed; `onCreated` gets the saved name.
    create: (seed: ConfigurableSeed, onCreated: (name: string) => void) => void;
}

export type DropAction = (target: InsertTarget) => void;

// One drag at a time; drags from outside the webview carry only text and never set this.
let draggedInsert: DropAction | null = null;

export const setDraggedInsert = (action: DropAction | null) => {
    draggedInsert = action;
};

export const DATA_BROWSER_WIDTH = 340;

const COLLAPSED_KEY = "dataBrowser.collapsed";

const readCollapsed = (): boolean | undefined => {
    try {
        const stored = localStorage.getItem(COLLAPSED_KEY);
        return stored === null ? undefined : stored === "true";
    } catch {
        return undefined;
    }
};

let collapsedPreference = readCollapsed();
const collapseListeners = new Set<() => void>();

const setCollapsedPreference = (collapsed: boolean) => {
    collapsedPreference = collapsed;
    try {
        localStorage.setItem(COLLAPSED_KEY, String(collapsed));
    } catch {
        // Storage can be unavailable; the choice still holds for this session.
    }
    collapseListeners.forEach((listener) => listener());
};

const subscribeCollapsed = (listener: () => void) => {
    collapseListeners.add(listener);
    return () => collapseListeners.delete(listener);
};

/** Whether a foldable browser is folded away: the user's last choice anywhere, folded until they open one. */
export function useBrowserCollapsed() {
    const preference = useSyncExternalStore(subscribeCollapsed, () => collapsedPreference);
    return { collapsed: preference ?? true, setCollapsed: setCollapsedPreference };
}

const WIDTH_KEY = "dataBrowser.width";
const MIN_WIDTH = 280;
const MAX_WIDTH = 560;

const clampWidth = (width: number) => Math.round(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width)));

const readWidth = () => {
    try {
        const stored = Number(localStorage.getItem(WIDTH_KEY));
        return stored ? clampWidth(stored) : DATA_BROWSER_WIDTH;
    } catch {
        return DATA_BROWSER_WIDTH;
    }
};

let browserWidth = readWidth();
const widthListeners = new Set<() => void>();

// Styled hosts size from this variable; hosts that need a number use the hook.
const applyWidth = () => document.documentElement.style.setProperty("--data-browser-width", `${browserWidth}px`);
applyWidth();

export const setDataBrowserWidth = (width: number | ((current: number) => number)) => {
    browserWidth = clampWidth(typeof width === "function" ? width(browserWidth) : width);
    applyWidth();
    try {
        localStorage.setItem(WIDTH_KEY, String(browserWidth));
    } catch {
        // Storage can be unavailable; the width still holds for this session.
    }
    widthListeners.forEach((listener) => listener());
};

const subscribeWidth = (listener: () => void) => {
    widthListeners.add(listener);
    return () => widthListeners.delete(listener);
};

/** The Data Browser's width, the same in every host; the user sets it by dragging the browser's edge. */
export const useDataBrowserWidth = () => useSyncExternalStore(subscribeWidth, () => browserWidth);

// A container's free slot beside a form; a form inside claims it to show its browser there.
export interface BrowserSlot {
    element: HTMLElement | null;
    claim: () => () => void;
    // A page's slot can fold away; a side panel's browser stays open beside its form.
    foldable: boolean;
}

export const BrowserSlotContext = createContext<BrowserSlot | undefined>(undefined);

export const useBrowserSlot = () => useContext(BrowserSlotContext);

/** For a container that offers a slot: `slot` goes in BrowserSlotContext, `ref` on the slot element once `claimed`. */
export function useBrowserSlotHost(available: boolean, foldable: boolean) {
    const [claims, setClaims] = useState(0);
    const [element, setElement] = useState<HTMLElement | null>(null);
    const claim = useCallback(() => {
        setClaims((count) => count + 1);
        return () => setClaims((count) => count - 1);
    }, []);
    const slot = useMemo(
        () => (available ? { element, claim, foldable } : undefined),
        [available, element, claim, foldable]
    );
    return { slot, claimed: available && claims > 0, ref: setElement };
}

// Lets a panel beside the form insert values into the field that was focused last.
export const InsertTargetContext = createContext<InsertTargetContextType | undefined>(undefined);

export const useInsertTargetContext = () => useContext(InsertTargetContext);

/** Content drawn over the page: forms inside start their own browser scope rather than use one it hides. */
export function DataBrowserBoundary({ children }: { children: ReactNode }) {
    return (
        <InsertTargetContext.Provider value={undefined}>
            <BrowserSlotContext.Provider value={undefined}>{children}</BrowserSlotContext.Provider>
        </InsertTargetContext.Provider>
    );
}

const TEMPLATE_FIELDS = new Set(["PROMPT", "RAW_TEMPLATE"]);

// `drop` returns false for drags that did not come from an insert source, and leaves those to the editor.
export function useInsertTarget(
    insert: (value: string) => void,
    ownField?: FormField
): { register: () => void; drop: (event: { preventDefault(): void }, place?: () => void) => boolean } {
    const context = useContext(InsertTargetContext);
    const contextField = useOptionalFieldContext()?.field;
    const field = ownField ?? contextField;
    const label = field?.label ?? "";
    const { updateImports, form, nodeInfo } = useFormContext();
    const assist = useContext(FieldAssistContext);
    const host = useAssistHost();
    const markKey = useAssistKey(field?.key ?? "");
    const assistRef = useRef(assist);
    assistRef.current = assist;
    const idRef = useRef(Symbol());
    const insertRef = useRef(insert);
    insertRef.current = insert;
    const targetRef = useRef<() => InsertTarget>();
    const isVariableValue = nodeInfo?.kind === "VARIABLE" && field?.key === "expression";
    // A value goes into a template as an interpolation, which takes text, not the field's own type.
    const isTemplate = TEMPLATE_FIELDS.has(field?.types?.find((type) => type.selected)?.fieldType);
    targetRef.current = () => ({
        id: idRef.current,
        label,
        // A variable's value takes its type and purpose from the form's Type and Name fields.
        expectedType: (isVariableValue && form?.getValues("type")) || (isTemplate ? "string" : getFieldTypeLabel(field?.types)),
        nameHint: isVariableValue ? form?.getValues("variable") : undefined,
        insert: (value) => {
            // A picked value is the user's edit, as typing is, so Copilot's change to the field leaves review.
            host?.dropMark(markKey);
            insertRef.current(value);
        },
        addImports: (imports) => field && updateImports?.(field.key, imports),
        askCopilot: assist ? (draft) => assistRef.current?.open(undefined, draft) : undefined,
    });

    useEffect(() => () => context?.setTarget((prev) => (prev?.id === idRef.current ? null : prev)), []);

    const register = useCallback(() => context?.setTarget(targetRef.current()), []);
    const drop = useCallback((event: { preventDefault(): void }, place?: () => void) => {
        const action = draggedInsert;
        if (!action) {
            return false;
        }
        event.preventDefault();
        draggedInsert = null;
        place?.();
        const target = targetRef.current();
        context?.setTarget(target);
        action(target);
        return true;
    }, []);

    return { register, drop };
}
