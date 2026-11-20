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

import React, { useEffect, useMemo, useRef, useState } from "react";
import { debounce, isEqual } from "lodash";
import type {
    ConnectionConfigurableChoice,
    ConnectionConfigurablePreview,
    ConnectionConfigurablesResponse,
    Property
} from "@wso2/ballerina-core";
import type { FieldFooterRenderer, InputMode } from "@wso2/ballerina-side-panel";
import { ConfigurableLine } from "../../HelperPaneNew/Components/RecordFormView/ConfigurableLine";
import {
    FieldConfigurable,
    isConfigurableValue,
    parameterKey,
    RenameConfigurable,
    renameConfigurableInChoices,
    shownName
} from "../../HelperPaneNew/Components/RecordFormView/configurables";
import { useConfigurableRename } from "../../HelperPaneNew/Components/RecordFormView/useConfigurableRename";
import { fieldChoiceToSend, hasValue, isArgumentKind, isTypedMode, OWN_VALUE_PATH } from "./fieldConfigurables";

const PREVIEW_DELAY_MS = 400;
/** The connection's name, which the configurables' generated names start with. */
const CONNECTION_NAME_KEY = "variable";

export interface ConnectionFieldConfigurables {
    /** Draws the "Make configurable" line under each field of a connection form that a value is typed in. */
    renderFieldFooter?: FieldFooterRenderer;
    /**
     * What to tell the language server about a property's own value, or null for a property that is no argument.
     * Undefined means the value is made configurable under the name the server gives it.
     */
    choiceFor: (key: string, property: Property) => ConnectionConfigurableChoice | undefined | null;
    /** Asks for the names again once typing pauses, if the field that changed can change them. */
    schedulePreview: (changedKey?: string) => void;
    /**
     * Applies a rename still being typed, as the form saves: the name of a configurable saving creates. A configurable
     * the connection already uses is renamed only when the user agrees to it, so for one the user is asked, as for a
     * name that isn't valid or can't be renamed, and the form isn't saved until they settle it.
     *
     * @returns whether the form can be saved now
     */
    commitRename: () => boolean;
    /** Starts from the configurables an existing connection already uses, and the preview that found them. */
    adopt: (choices: Record<string, FieldConfigurable>, response: ConnectionConfigurablesResponse | undefined) => void;
    /** Once a configurable the connection already uses is renamed across the project, its fields use the new name. */
    applyRename: (from: string, to: string) => void;
}

/** The previews of the arguments that are themselves the value, by field key. */
function ownValuePreviews(response: ConnectionConfigurablesResponse | undefined) {
    const byKey: Record<string, ConnectionConfigurablePreview> = {};
    (response?.configurables ?? [])
        .filter((item) => item.fieldPath === OWN_VALUE_PATH)
        .forEach((item) => { byKey[parameterKey(item)] = item; });
    return byKey;
}

/**
 * The configurables of a connection form's fields whose value is the argument itself. The user's choices, the names
 * the language server gives, and any rename in progress live here, by the field's key.
 *
 * @param enabled       whether the form is a connection's
 * @param preview       asks the language server what saving would make of the connection as the form holds it
 * @param rename        renames a configurable the connection already uses across the project, once the user agrees
 * @param newConnection whether the connection is new, so its required values start configurable; an existing
 *                      connection's literals stay unless the user makes them configurable
 */
export function useConnectionFieldConfigurables(
    enabled: boolean,
    preview: () => Promise<ConnectionConfigurablesResponse | undefined>,
    rename: RenameConfigurable,
    newConnection: boolean
): ConnectionFieldConfigurables {
    const [choices, setChoices] = useState<Record<string, FieldConfigurable>>({});
    const [previews, setPreviews] = useState<Record<string, ConnectionConfigurablePreview> | null>(null);
    // Why the last preview failed: shown on each line in place of names that would be stale.
    const [previewError, setPreviewError] = useState<string | undefined>(undefined);
    const [renaming, setRenaming] = useState<{ key: string; draft: string } | null>(null);
    // The mode each field's editor was last drawn in: a value typed in the expression mode is code, kept as is.
    const modesRef = useRef<Record<string, InputMode>>({});
    // Written with the state, so what the form saves includes a choice made in the same event.
    const choicesRef = useRef(choices);
    const previewRef = useRef(preview);
    previewRef.current = preview;
    const requestIdRef = useRef(0);

    const showPreviews = (response: ConnectionConfigurablesResponse | undefined) => {
        if (response?.errorMsg) {
            showPreviewFailure(response.errorMsg);
            return;
        }
        const byKey = ownValuePreviews(response);
        setPreviewError(undefined);
        setPreviews((previous) => (isEqual(previous, byKey) ? previous : byKey));
    };

    const showPreviewFailure = (reason: string) => {
        setPreviewError(`Couldn't work out the configurables: ${reason}`);
        setPreviews({});
    };

    const debouncedPreview = useMemo(() => debounce(async () => {
        const requestId = ++requestIdRef.current;
        try {
            const response = await previewRef.current();
            if (requestId === requestIdRef.current) {
                showPreviews(response);
            }
        } catch (error) {
            console.error(">>> Could not preview the connection's configurables", error);
            if (requestId === requestIdRef.current) {
                showPreviewFailure(error instanceof Error ? error.message : String(error));
            }
        }
    }, PREVIEW_DELAY_MS), []);

    useEffect(() => {
        if (enabled) {
            debouncedPreview();
        }
        return () => debouncedPreview.cancel();
    }, [enabled]);

    const writeChoices = (next: Record<string, FieldConfigurable>) => {
        choicesRef.current = next;
        setChoices(next);
        debouncedPreview();
    };

    const setChoice = (key: string, choice: Partial<FieldConfigurable>) => {
        writeChoices({ ...choicesRef.current, [key]: { ...choicesRef.current[key], ...choice } });
    };

    // The form owns the choices of every field, so it applies the rename (applyRename); this only ends the edit.
    const configurableRename = useConfigurableRename(rename, (key) => {
        setRenaming((current) => (current?.key === key ? null : current));
    });

    /**
     * Applies a rename in progress. A name that is not an identifier stays in its box; one that renames a configurable
     * across the project is asked about first.
     *
     * @returns whether nothing is left to rename
     */
    const commitRename = (): boolean => {
        if (!enabled || !renaming) {
            return true;
        }
        const { key, draft } = renaming;
        // Its field left the mode a value is typed in, so the line and its box are gone: the draft goes with them,
        // and the choice stays as it was.
        if (!isTypedMode(modesRef.current[key])) {
            cancelRename(key);
            return true;
        }
        const done = configurableRename.commit({
            key,
            choice: choicesRef.current[key],
            draft,
            generated: previews?.[key]?.name,
            applyName: (choice) => setChoice(key, choice),
            interactive: true
        });
        if (done) {
            setRenaming(null);
        }
        return done;
    };

    const cancelRename = (key: string) => {
        configurableRename.clear(key);
        setRenaming(null);
    };

    const renderFieldFooter: FieldFooterRenderer = (field, inputMode, value) => {
        modesRef.current[field.key] = inputMode;
        if (!isTypedMode(inputMode)) {
            return null;
        }
        const required = !field.optional;
        const choice = choices[field.key];
        const item = previews?.[field.key];
        const typed = hasValue(value);
        // An optional field shows the line once it has a value of the user's own.
        if (!required && !choice && (!typed || String(value).trim() === String(field.defaultValue ?? "").trim())) {
            return null;
        }
        // An optional value the server won't make configurable: one Config.toml can't hold, or of a type no
        // configurable has. A required field keeps its line while the server catches up with what is typed.
        if (!required && typed && previews && !item && !choice?.existing && !previewError) {
            return null;
        }
        const editing = renaming?.key === field.key;
        return (
            <div style={{ marginTop: "6px" }}>
                <ConfigurableLine
                    path={field.key}
                    on={isConfigurableValue(required && newConnection, choice)}
                    name={shownName(choice, item)}
                    error={configurableRename.errorFor(field.key) ?? item?.error ?? previewError}
                    existing={choice?.existing}
                    editing={editing}
                    draft={editing ? renaming.draft : undefined}
                    busy={configurableRename.isBusy(field.key)}
                    confirmation={configurableRename.confirmationFor(field.key)}
                    onToggle={(next) => {
                        setChoice(field.key, { keep: !next });
                        if (!next && editing) {
                            cancelRename(field.key);
                        }
                    }}
                    onStartRename={() => setRenaming({ key: field.key, draft: shownName(choice, item) ?? "" })}
                    onDraftChange={(draft) => {
                        configurableRename.clear(field.key);
                        setRenaming({ key: field.key, draft });
                    }}
                    onCommit={() => commitRename()}
                    onCancel={() => cancelRename(field.key)}
                />
            </div>
        );
    };

    return {
        renderFieldFooter: enabled ? renderFieldFooter : undefined,
        choiceFor: (key, property) => isArgumentKind(property?.codedata?.kind)
            ? fieldChoiceToSend(!property.optional, modesRef.current[key], choicesRef.current[key], newConnection)
            : null,
        schedulePreview: (changedKey) => {
            // Only the connection's name and the values typed in change the names.
            if (enabled && (changedKey === undefined || changedKey === CONNECTION_NAME_KEY
                || isTypedMode(modesRef.current[changedKey]))) {
                debouncedPreview();
            }
        },
        commitRename,
        adopt: (adopted, response) => {
            choicesRef.current = { ...adopted, ...choicesRef.current };
            setChoices(choicesRef.current);
            showPreviews(response);
        },
        applyRename: (from, to) => {
            const renamed = renameConfigurableInChoices(choicesRef.current, from, to);
            if (renamed !== choicesRef.current) {
                writeChoices(renamed);
            }
        }
    };
}
