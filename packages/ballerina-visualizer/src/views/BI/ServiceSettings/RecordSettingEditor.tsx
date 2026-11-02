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
import styled from "@emotion/styled";
import type { ServiceSetting, ServiceSettingFieldValue } from "@wso2/ballerina-core";
import { Button, TextField, ThemeColors, Toggle } from "@wso2/ui-toolkit";
import { draftOf, parseRecordDraft, RecordDraft } from "./recordDraft";
import { Actions, Description, ErrorText, Section } from "./styles";

const ToggleRow = styled.div`
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
`;

const ToggleText = styled.div`
    display: flex;
    flex-direction: column;
    gap: 2px;
`;

const ToggleLabel = styled.span`
    color: ${ThemeColors.ON_SURFACE};
`;

const FieldDescription = styled.span`
    font-size: 12px;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
`;

interface RecordSettingEditorProps {
    setting: ServiceSetting;
    saving: boolean;
    error?: string;
    onSave: (recordValue: Record<string, ServiceSettingFieldValue>) => void;
    onCancel: () => void;
}

/**
 * The editor of a record setting, such as CORS: one control per sub-field. Unset sub-fields start at their default,
 * and the language server leaves the ones still at their default out of the source.
 */
export function RecordSettingEditor({ setting, saving, error, onSave, onCancel }: RecordSettingEditorProps) {
    const fields = setting.fields ?? [];
    const [draft, setDraft] = useState<RecordDraft>(() => draftOf(setting));
    const [showErrors, setShowErrors] = useState(false);
    const parsed = parseRecordDraft(fields, draft);

    const save = () => {
        if (Object.keys(parsed.errors).length > 0) {
            setShowErrors(true);
            return;
        }
        onSave(parsed.value);
    };

    return (
        <Section>
            {setting.description && <Description>{setting.description}</Description>}
            {fields.map((field) => {
                const id = `service-setting-${setting.field}-${field.name}`;
                if (field.kind === "toggle") {
                    return (
                        <ToggleRow key={field.name}>
                            <ToggleText>
                                <ToggleLabel id={`${id}-label`}>{field.label}</ToggleLabel>
                                {field.description && <FieldDescription>{field.description}</FieldDescription>}
                            </ToggleText>
                            <Toggle
                                id={id}
                                checked={draft[field.name] === true}
                                onChange={(checked: boolean) => setDraft({ ...draft, [field.name]: checked })}
                                sx={{ margin: 0 }}
                            />
                        </ToggleRow>
                    );
                }
                return (
                    <TextField
                        key={field.name}
                        id={id}
                        label={field.label}
                        description={field.kind === "textList"
                            ? [field.description, "Separate values with commas."].filter(Boolean).join(" ")
                            : field.description}
                        value={String(draft[field.name] ?? "")}
                        placeholder={field.placeholder}
                        inputMode={field.kind === "integer" || field.kind === "decimal" ? "decimal" : undefined}
                        onTextChange={(text: string) => setDraft({ ...draft, [field.name]: text })}
                        errorMsg={showErrors ? parsed.errors[field.name] : undefined}
                    />
                );
            })}
            {error && <ErrorText role="alert">{error}</ErrorText>}
            <Actions>
                <Button appearance="secondary" onClick={onCancel} disabled={saving}>Cancel</Button>
                <Button appearance="primary" onClick={save} disabled={saving}>
                    {saving ? "Saving..." : "Save"}
                </Button>
            </Actions>
        </Section>
    );
}
