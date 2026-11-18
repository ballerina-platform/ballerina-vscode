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

// Committing a configurable's new name, for the record editor's fields and for a connection form's own fields alike.
// A configurable the connection already uses is renamed across the project right away, once the user agrees to it
// in a confirmation next to the name (ConfigurableLine shows it, as the product's other confirmations are shown).

import { useRef, useState } from "react";
import {
    ConfigurableRenameRequest,
    FieldConfigurable,
    planRename,
    RenameConfigurable
} from "./configurables";

/**
 * The confirmation: a question, then what agreeing does, in the words the product uses wherever a rename updates
 * references (IdentifierEditor).
 */
export function renameConfirmationMessage({ from, to }: Pick<ConfigurableRenameRequest, "from" | "to">): string {
    return `Rename configurable? Renaming ${from} to ${to} will update all references across the project.`;
}

export function renameFailureMessage(from: string): string {
    return `Could not rename ${from}.`;
}

/** A rename across the project waiting for the user to agree to it, as ConfigurableLine asks about it. */
export interface RenameConfirmation {
    message: string;
    /** Whether the user agreed. */
    onConfirm: (confirmed: boolean) => void;
}

/** How a typed name is committed (see ConfigurableRename.commit). */
export interface RenameCommit {
    /** The field's key, or its path in the record. */
    key: string;
    choice: FieldConfigurable | undefined;
    draft: string;
    /** The name the language server gives the value, if the user doesn't name it. */
    generated: string | undefined;
    /** Records the name a configurable saving will create takes. */
    applyName: (choice: Partial<FieldConfigurable>) => void;
    /**
     * Whether a configurable the connection already uses may be renamed, after asking. Not when the form is being
     * saved: the user hasn't agreed to it, so the name typed is dropped.
     */
    interactive: boolean;
}

export interface ConfigurableRename {
    /**
     * Commits a typed name and returns whether the edit is done. A rename across the project asks first, so the edit
     * stays open (false) until it is done, when `onRenamed` is called.
     */
    commit: (commit: RenameCommit) => boolean;
    /** Why the last rename of this key failed, if it did. */
    errorFor: (key: string) => string | undefined;
    /** Whether a rename of this key is running, until the form uses the new name. */
    isBusy: (key: string) => boolean;
    /** Whether any rename is running, so the form isn't saved meanwhile. */
    busy: boolean;
    /** Forgets a failed rename, as the user edits or leaves the name. */
    clear: (key: string) => void;
    /** The confirmation to show at this key's name, while the user is asked. */
    confirmationFor: (key: string) => RenameConfirmation | undefined;
}

/**
 * Renames configurables the connection already uses across the project, after asking.
 *
 * @param rename    what renames one; undefined where nothing can be renamed (no confirmation is offered then)
 * @param onRenamed called once a rename is done, with the key it was asked for and what was renamed
 */
export function useConfigurableRename(
    rename: RenameConfigurable | undefined,
    onRenamed: (key: string, request: ConfigurableRenameRequest) => void
): ConfigurableRename {
    const [asking, setAsking] = useState<{ key: string; request: ConfigurableRenameRequest } | null>(null);
    const [busyKey, setBusyKey] = useState<string | null>(null);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const onRenamedRef = useRef(onRenamed);
    onRenamedRef.current = onRenamed;

    const setError = (key: string, error: string | undefined) => {
        setErrors((previous) => {
            if (previous[key] === error) {
                return previous;
            }
            const next = { ...previous };
            if (error === undefined) {
                delete next[key];
            } else {
                next[key] = error;
            }
            return next;
        });
    };

    const commit = ({ key, choice, draft, generated, applyName, interactive }: RenameCommit): boolean => {
        const plan = planRename(choice, draft, generated);
        switch (plan.kind) {
            case "invalid":
                return false;
            case "unchanged":
                setError(key, undefined);
                return true;
            case "name":
                applyName(plan.choice);
                return true;
            case "unavailable":
                if (interactive) {
                    setError(key, renameFailureMessage(choice?.name ?? draft.trim()));
                }
                return !interactive;
            case "project":
                if (!interactive || !rename) {
                    return !interactive;
                }
                setError(key, undefined);
                setAsking({ key, request: plan.request });
                return false;
        }
    };

    const runRename = async (key: string, request: ConfigurableRenameRequest) => {
        setBusyKey(key);
        try {
            if (await rename!(request)) {
                setError(key, undefined);
                onRenamedRef.current(key, request);
            } else {
                // The language server found nothing to rename: the source keeps the old name, so does the form.
                setError(key, renameFailureMessage(request.from));
            }
        } catch (error) {
            console.error(`>>> Could not rename configurable ${request.from} to ${request.to}`, error);
            setError(key, renameFailureMessage(request.from));
        } finally {
            setBusyKey(null);
        }
    };

    const confirmationFor = (key: string): RenameConfirmation | undefined => {
        if (!asking || asking.key !== key) {
            return undefined;
        }
        return {
            message: renameConfirmationMessage(asking.request),
            onConfirm: (confirmed) => {
                setAsking(null);
                // Declined: nothing changes, and the name stays in its box, to fix or to cancel.
                if (confirmed) {
                    void runRename(key, asking.request);
                }
            }
        };
    };

    return {
        commit,
        errorFor: (key) => errors[key],
        isBusy: (key) => busyKey === key,
        busy: busyKey !== null,
        clear: (key) => setError(key, undefined),
        confirmationFor
    };
}
