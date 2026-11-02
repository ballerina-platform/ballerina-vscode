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

import React, { useState } from "react";
import type { ServiceSetting } from "@wso2/ballerina-core";
import { Button, TextField, Toggle } from "@wso2/ui-toolkit";
import { isPositiveInteger, isSet, toggleState } from "./summary";
import { Actions, Description, ErrorText, InlineActions, Section } from "./styles";

interface ValueSettingEditorProps {
    setting: ServiceSetting;
    saving: boolean;
    error?: string;
    /** Saves the value as a Ballerina expression. */
    onSave: (value: string) => void;
    onCancel: () => void;
}

/**
 * The editor of a setting whose value is a single literal: a toggle, a whole number or a string.
 */
export function ValueSettingEditor({ setting, saving, error, onSave, onCancel }: ValueSettingEditorProps) {
    const [enabled, setEnabled] = useState<boolean>(toggleState(setting));
    const [text, setText] = useState<string>(isSet(setting) ? unquote(setting.value) : "");
    const [touched, setTouched] = useState(false);

    const validation = validate(setting, text);
    const canSave = setting.editorKind === "toggle" || !validation;

    const save = () => {
        setTouched(true);
        if (!canSave) {
            return;
        }
        if (setting.editorKind === "toggle") {
            onSave(enabled ? "true" : "false");
        } else if (setting.editorKind === "number") {
            onSave(text.trim());
        } else {
            onSave(JSON.stringify(text));
        }
    };

    return (
        <Section>
            {setting.description && <Description>{setting.description}</Description>}
            {setting.editorKind === "toggle" ? (
                <InlineActions>
                    <Toggle checked={enabled} onChange={setEnabled} sx={{ margin: 0 }} />
                    <span>{enabled ? "On" : "Off"}</span>
                </InlineActions>
            ) : (
                <TextField
                    id={`service-setting-${setting.field}`}
                    label={setting.label}
                    value={text}
                    placeholder={setting.placeholder}
                    inputMode={setting.editorKind === "number" ? "numeric" : undefined}
                    autoFocus
                    onTextChange={(value: string) => {
                        setText(value);
                        setTouched(true);
                    }}
                    onKeyDown={(event: React.KeyboardEvent) => {
                        if (event.key === "Enter") {
                            save();
                        }
                    }}
                    errorMsg={touched ? validation : undefined}
                />
            )}
            {error && <ErrorText role="alert">{error}</ErrorText>}
            <Actions>
                <Button appearance="secondary" onClick={onCancel} disabled={saving}>Cancel</Button>
                <Button appearance="primary" onClick={save} disabled={saving || (touched && !canSave)}>
                    {saving ? "Saving..." : "Save"}
                </Button>
            </Actions>
        </Section>
    );
}

function validate(setting: ServiceSetting, text: string): string | undefined {
    if (setting.editorKind === "number") {
        return isPositiveInteger(text) ? undefined : "Enter a whole number of 1 or more.";
    }
    if (setting.editorKind === "text") {
        return text.trim() ? undefined : "Enter a value.";
    }
    return undefined;
}

/** A string setting is written as a Ballerina string literal; its editor shows the text inside the quotes. */
function unquote(value: string): string {
    const trimmed = value.trim();
    if (trimmed.length >= 2 && trimmed.startsWith("\"") && trimmed.endsWith("\"")) {
        try {
            return JSON.parse(trimmed);
        } catch {
            return trimmed.slice(1, -1);
        }
    }
    return trimmed;
}
