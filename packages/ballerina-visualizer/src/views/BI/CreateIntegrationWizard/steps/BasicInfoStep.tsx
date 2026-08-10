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

import { useEffect, useRef } from "react";
import styled from "@emotion/styled";
import { Codicon, DirectorySelector, TextField } from "@wso2/ui-toolkit";

const FieldGroup = styled.div`
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: 20px;
`;

const InfoNote = styled.div`
    display: flex;
    align-items: flex-start;
    gap: 6px;
    margin-top: 6px;
    font-size: 12px;
    line-height: 1.4;
    color: var(--vscode-descriptionForeground);
`;

interface BasicInfoStepProps {
    integrationName: string;
    /** Full creation path shown in the field: `<baseDir>/<directoryName>`. */
    fullPath: string;
    nameError: string | null;
    pathError: string | null;
    /** The chosen path is inside an existing Ballerina project — the new
     *  integration will be added into it rather than created standalone. */
    existingWorkspace: boolean;
    onNameChange: (value: string) => void;
    /** Fired when the path field text changes; the parent re-splits it into
     *  parent directory + directory name. */
    onPathChange: (value: string) => void;
    onBrowse: () => Promise<void>;
    /** Hide the path field — the location is fixed by the chosen project (the
     *  integration is created inside it), so only the name is asked for. */
    hidePath?: boolean;
}

/**
 * Integration name and the full path the integration is created at (the Name step).
 * The path field shows the complete target directory (`<parent>/<folder>`); its
 * last segment defaults to the integration name and stays editable and
 * independent of the Ballerina package name.
 */
export function BasicInfoStep({
    integrationName,
    fullPath,
    nameError,
    pathError,
    existingWorkspace,
    onNameChange,
    onPathChange,
    onBrowse,
    hidePath = false,
}: BasicInfoStepProps) {
    const nameFieldRef = useRef<HTMLInputElement>(null);
    // Set on the first user edit, so the re-select below never fights their typing.
    const nameEditedRef = useRef(false);

    // Focus and select the default name so the user can immediately overtype it.
    // Two things make this awkward:
    //  - VSCodeTextField is a web component: the real <input> lives in its shadow
    //    DOM (so it must be targeted directly), the element may not have upgraded
    //    yet on the first frame, and its value sync from the `value` prop lags
    //    render by a frame or two.
    //  - The wizard seeds the actual default asynchronously ("Untitled" becomes
    //    "Untitled_2" when the name is taken), so the name can change *after* the
    //    initial select — and that later value sync collapses the selection to a
    //    caret. Hence re-running whenever the rendered name changes.
    useEffect(() => {
        if (nameEditedRef.current) {
            return;
        }
        // Normally resolves within the first frame or two. GIVE_UP_AFTER is just a
        // backstop so a mount where the value never syncs still ends up focused,
        // instead of polling forever.
        const GIVE_UP_AFTER_FRAMES = 60;
        let rafId: number;
        let attempts = 0;
        const trySelect = () => {
            const inner = (nameFieldRef.current as any)?.shadowRoot?.querySelector("input") as HTMLInputElement | null;
            const gaveUp = attempts >= GIVE_UP_AFTER_FRAMES;
            // Wait for the rendered value to actually reach the input: selecting any
            // earlier either selects nothing or selects text the pending sync then
            // replaces, which drops the selection.
            if (inner && (inner.value === integrationName || gaveUp)) {
                inner.focus();
                inner.select();
                return;
            }
            if (gaveUp) {
                return;
            }
            attempts++;
            rafId = requestAnimationFrame(trySelect);
        };
        rafId = requestAnimationFrame(trySelect);
        return () => cancelAnimationFrame(rafId);
    }, [integrationName]);

    return (
        <>
            <FieldGroup>
                <TextField
                    ref={nameFieldRef}
                    // `onTextChange` is wired to the element's `input` event, so it fires
                    // only for real user edits — never for the wizard's async name seed.
                    onTextChange={(value: string) => {
                        nameEditedRef.current = true;
                        onNameChange(value);
                    }}
                    value={integrationName}
                    label="Integration Name"
                    placeholder="Enter an integration name"
                    required={true}
                    errorMsg={nameError || ""}
                />
            </FieldGroup>
            {!hidePath && (
                <FieldGroup>
                    <DirectorySelector
                        id="integration-folder-selector"
                        label="Select Path"
                        placeholder="Enter path or browse to select a folder..."
                        selectedPath={fullPath}
                        required={true}
                        onSelect={onBrowse}
                        onChange={onPathChange}
                        errorMsg={pathError || undefined}
                    />
                    {existingWorkspace && !pathError && (
                        <InfoNote>
                            <Codicon name="info" sx={{ marginTop: "1px" }} />
                            <span>This is an integrator project. Your new integration will be added to it.</span>
                        </InfoNote>
                    )}
                </FieldGroup>
            )}
        </>
    );
}
