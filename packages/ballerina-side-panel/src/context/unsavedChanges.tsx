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

import { createContext, useContext, useEffect, useId } from "react";

export interface UnsavedChanges {
    report: (id: string, dirty: boolean) => void;
    // Runs the action at once when no form holds unsaved edits; otherwise only after the user discards them.
    confirmDiscard: (action: () => void) => void;
}

export const UnsavedChangesContext = createContext<UnsavedChanges | undefined>(undefined);

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
