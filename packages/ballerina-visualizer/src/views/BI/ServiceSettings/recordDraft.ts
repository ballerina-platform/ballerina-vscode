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

import type { ServiceSetting, ServiceSettingField, ServiceSettingFieldValue } from "@wso2/ballerina-core";

/**
 * A record editor's state: a toggle as a boolean, every other sub-field as the text in its input. A text list is
 * shown comma-separated.
 */
export type RecordDraft = Record<string, boolean | string>;

/** The editor's starting state: the values set in source, and each unset sub-field at its default. */
export function draftOf(setting: ServiceSetting): RecordDraft {
    const draft: RecordDraft = {};
    for (const field of setting.fields ?? []) {
        const value = setting.recordValue?.[field.name] ?? field.defaultValue;
        if (field.kind === "toggle") {
            draft[field.name] = value === true;
        } else if (Array.isArray(value)) {
            draft[field.name] = value.join(", ");
        } else {
            draft[field.name] = value === undefined ? "" : String(value);
        }
    }
    return draft;
}

/**
 * The sub-field values the draft stands for, and a message for each sub-field whose text is not valid. An empty
 * number is left out, so the record type's default applies.
 */
export function parseRecordDraft(fields: ServiceSettingField[], draft: RecordDraft): {
    value: Record<string, ServiceSettingFieldValue>;
    errors: Record<string, string>;
} {
    const value: Record<string, ServiceSettingFieldValue> = {};
    const errors: Record<string, string> = {};
    for (const field of fields) {
        const raw = draft[field.name];
        switch (field.kind) {
            case "toggle":
                value[field.name] = raw === true;
                break;
            case "integer":
            case "decimal": {
                const text = String(raw ?? "").trim();
                if (!text) {
                    break;
                }
                const pattern = field.kind === "integer" ? /^-?\d+$/ : /^-?(\d+\.?\d*|\.\d+)$/;
                if (!pattern.test(text)) {
                    errors[field.name] = field.kind === "integer" ? "Enter a whole number." : "Enter a number.";
                    break;
                }
                value[field.name] = Number(text);
                break;
            }
            case "textList":
                value[field.name] = String(raw ?? "").split(",").map((item) => item.trim()).filter(Boolean);
                break;
            default:
                value[field.name] = String(raw ?? "");
        }
    }
    return { value, errors };
}
