/**
 * Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com) All Rights Reserved.
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

import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef } from "react";

export interface UnsavedChanges {
    report: (id: string, dirty: boolean) => void;
    // Runs the action at once when no form in this scope holds unsaved edits; otherwise only after the user discards them.
    confirmDiscard: (action: () => void) => void;
    // Shows the discard dialog and runs the action on Discard.
    ask: (action: () => void) => void;
}

export const UnsavedChangesContext = createContext<UnsavedChanges | undefined>(undefined);

// A scope sees the forms rendered below it, and passes every report up so that outer scopes see them too.
export function createUnsavedChangesScope(
    ask: (action: () => void) => void,
    dirtyForms: Set<string>,
    forward?: (id: string, dirty: boolean) => void
): UnsavedChanges {
    const report = (id: string, dirty: boolean) => {
        if (dirty) {
            dirtyForms.add(id);
        } else {
            dirtyForms.delete(id);
        }
        forward?.(id, dirty);
    };
    const confirmDiscard = (action: () => void) => {
        if (dirtyForms.size === 0) {
            action();
            return;
        }
        ask(() => {
            [...dirtyForms].forEach((id) => report(id, false));
            action();
        });
    };
    return { report, confirmDiscard, ask };
}

// For a container closed on its own (a side panel, a pop-up): provide `scope` to its content, close through `confirmDiscard`.
export function useUnsavedChangesScope() {
    const parent = useContext(UnsavedChangesContext);
    const dirtyForms = useRef(new Set<string>());
    const scope = useMemo(
        () => parent && createUnsavedChangesScope(parent.ask, dirtyForms.current, parent.report),
        [parent]
    );
    const confirmDiscard = useCallback(
        (action: () => void) => (scope ? scope.confirmDiscard(action) : action()),
        [scope]
    );
    return { scope, confirmDiscard };
}

export function useReportUnsavedChanges(dirty: boolean) {
    const changes = useContext(UnsavedChangesContext);
    const id = useId();
    useEffect(() => {
        changes?.report(id, dirty);
    }, [changes, id, dirty]);
    useEffect(() => () => changes?.report(id, false), [changes, id]);
}

export function useConfirmDiscard() {
    const changes = useContext(UnsavedChangesContext);
    return (action: () => void) => (changes ? changes.confirmDiscard(action) : action());
}
