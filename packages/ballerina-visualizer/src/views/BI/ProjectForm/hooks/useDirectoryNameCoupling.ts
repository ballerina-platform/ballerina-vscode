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

import { useCallback, useState } from "react";

/** Options for {@link deriveDirectoryName} / {@link useDirectoryNameCoupling}'s
 *  `handleDisplayNameChange`. */
export interface DisplayNameChangeOptions {
    /**
     * Forces the directory segment to re-couple to the display name even if it was
     * previously decoupled (`dirTouched`) — used by flows where retyping the display
     * name always retargets a fresh, name-derived folder (e.g. after Browse resolved
     * an existing project's real name into the field).
     */
    recouple?: boolean;
    /**
     * When true (the default), a blank/whitespace-only display name derives an empty
     * directory segment instead of sanitizing the whitespace itself. One call site
     * (library creation) intentionally sanitizes the raw value unconditionally, so it
     * can opt out with `false`.
     */
    guardBlank?: boolean;
}

/**
 * Derives the folder name from the display name while `dirTouched` is false; once touched
 * the current value is left as-is.
 */
export function deriveDirectoryName(
    displayName: string,
    dirTouched: boolean,
    currentDirectoryName: string,
    sanitize: (name: string) => string,
    options?: Pick<DisplayNameChangeOptions, "guardBlank">
): string {
    if (dirTouched) {
        return currentDirectoryName;
    }
    const guardBlank = options?.guardBlank ?? true;
    if (guardBlank && !displayName.trim()) {
        return "";
    }
    return sanitize(displayName);
}

/** Marks the directory segment decoupled once it is edited away from its name-derived default. */
export function isDirectoryNameTouched(directoryName: string, autoDirectoryName: string): boolean {
    return directoryName !== autoDirectoryName;
}

export interface DirectoryNameCoupling {
    directoryName: string;
    dirTouched: boolean;
    setDirectoryName: (directoryName: string) => void;
    setDirTouched: (dirTouched: boolean) => void;
    /** Display-name field changed: re-derive the directory segment while the user
     *  has not taken manual control of it (see {@link DisplayNameChangeOptions}). */
    handleDisplayNameChange: (displayName: string, options?: DisplayNameChangeOptions) => void;
    /** Directory segment directly edited (e.g. the path field's last segment):
     *  decouples from the display name once it diverges from the current
     *  name-derived default. */
    handleDirectoryNameEdit: (newDirectoryName: string, autoDirectoryName: string) => void;
}

/**
 * Shared Create-flow coupling: the directory segment mirrors the sanitized display name
 * until the user edits it (directly or via a path field's last segment), after which the
 * edit is honored exactly — including an empty segment ("create in the parent dir").
 * Call sites holding this inside a larger state object can use the pure
 * {@link deriveDirectoryName} / {@link isDirectoryNameTouched} instead.
 */
export function useDirectoryNameCoupling(
    initialDirectoryName: string | (() => string),
    sanitize: (name: string) => string
): DirectoryNameCoupling {
    const [state, setState] = useState(() => ({
        directoryName: typeof initialDirectoryName === "function" ? initialDirectoryName() : initialDirectoryName,
        dirTouched: false,
    }));

    const setDirectoryName = useCallback((directoryName: string) => {
        setState((prev) => ({ ...prev, directoryName }));
    }, []);

    const setDirTouched = useCallback((dirTouched: boolean) => {
        setState((prev) => ({ ...prev, dirTouched }));
    }, []);

    const handleDisplayNameChange = useCallback(
        (displayName: string, options?: DisplayNameChangeOptions) => {
            setState((prev) => {
                const dirTouched = options?.recouple ? false : prev.dirTouched;
                return {
                    directoryName: deriveDirectoryName(displayName, dirTouched, prev.directoryName, sanitize, options),
                    dirTouched,
                };
            });
        },
        [sanitize]
    );

    const handleDirectoryNameEdit = useCallback((newDirectoryName: string, autoDirectoryName: string) => {
        setState({
            directoryName: newDirectoryName,
            dirTouched: isDirectoryNameTouched(newDirectoryName, autoDirectoryName),
        });
    }, []);

    return {
        directoryName: state.directoryName,
        dirTouched: state.dirTouched,
        setDirectoryName,
        setDirTouched,
        handleDisplayNameChange,
        handleDirectoryNameEdit,
    };
}
