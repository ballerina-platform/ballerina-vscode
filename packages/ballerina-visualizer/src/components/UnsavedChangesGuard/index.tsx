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

import React, { ReactNode, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { UnsavedChanges, UnsavedChangesContext } from "@wso2/ballerina-side-panel";
import { Button, Codicon, Typography } from "@wso2/ui-toolkit";
import { PopupModal, PopupModalStep } from "../PopupModal";
import { CloseButton, HeaderTitleContainer, PopupContent, PopupFooter, PopupHeader, PopupTitle } from "../../views/BI/Connection/styles";

// Above the side panel (z-index 2000) and its expanded editor (2100).
const DIALOG_Z_INDEX = 2200;

export function UnsavedChangesGuard({ children }: { children: ReactNode }) {
    const dirtyForms = useRef(new Set<string>());
    const [pendingAction, setPendingAction] = useState<() => void>();

    const value = useMemo<UnsavedChanges>(() => ({
        report: (id, dirty) => {
            if (dirty) {
                dirtyForms.current.add(id);
            } else {
                dirtyForms.current.delete(id);
            }
        },
        confirmDiscard: (action) => {
            if (dirtyForms.current.size === 0) {
                action();
            } else {
                setPendingAction(() => action);
            }
        },
    }), []);

    const discard = () => {
        const action = pendingAction;
        dirtyForms.current.clear();
        setPendingAction(undefined);
        action?.();
    };

    return (
        <UnsavedChangesContext.Provider value={value}>
            {children}
            {pendingAction && createPortal(
                <PopupModal onClose={() => setPendingAction(undefined)} autoHeight maxWidth={420} dismissOnEscape dismissOnBackdropClick zIndexBase={DIALOG_Z_INDEX}>
                    {(close) => (
                        <PopupModalStep>
                            <PopupHeader>
                                <HeaderTitleContainer>
                                    <PopupTitle variant="h2">Unsaved Changes</PopupTitle>
                                </HeaderTitleContainer>
                                <CloseButton appearance="icon" onClick={close}>
                                    <Codicon name="close" />
                                </CloseButton>
                            </PopupHeader>
                            <PopupContent>
                                <Typography variant="body2">This form has changes that are not saved. Closing it discards them.</Typography>
                            </PopupContent>
                            <PopupFooter>
                                <Button appearance="secondary" onClick={close}>Cancel</Button>
                                <Button appearance="primary" onClick={discard}>Discard Changes</Button>
                            </PopupFooter>
                        </PopupModalStep>
                    )}
                </PopupModal>,
                document.body
            )}
        </UnsavedChangesContext.Provider>
    );
}
