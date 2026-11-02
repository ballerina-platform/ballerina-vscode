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

/** The longest summary a row or the badge tooltip shows before it is cut. */
export const MAX_SUMMARY_LENGTH = 48;

/** Whether the setting is set in source. */
export function isSet(setting: ServiceSetting): boolean {
    return setting.value !== undefined && setting.value !== null;
}

/** The settings set in source, in display order. */
export function setSettings(settings: ServiceSetting[]): ServiceSetting[] {
    return settings.filter(isSet);
}

/** The curated settings not set yet, which "Add" offers. */
export function availableSettings(settings: ServiceSetting[]): ServiceSetting[] {
    return settings.filter((setting) => !isSet(setting) && setting.editorKind !== "advanced");
}

/**
 * A one-line summary of a set setting's value, as the panel row and the badge tooltip show it.
 * Toggles read as On/Off, other values as written, with whitespace collapsed and long values cut.
 */
export function summarize(setting: ServiceSetting): string {
    if (!isSet(setting)) {
        return "";
    }
    if (setting.editorKind === "record" && setting.recordValue) {
        return cut(summarizeRecord(setting.fields ?? [], setting.recordValue));
    }
    const value = setting.value.trim();
    if (setting.editorKind === "toggle") {
        if (value === "true") {
            return "On";
        }
        if (value === "false") {
            return "Off";
        }
    }
    return cut(value);
}

/** Whitespace collapsed to one line, and cut to the summary length. */
function cut(text: string): string {
    const oneLine = text.replace(/\s+/g, " ").trim();
    return oneLine.length > MAX_SUMMARY_LENGTH ? `${oneLine.slice(0, MAX_SUMMARY_LENGTH - 1)}…` : oneLine;
}

/**
 * A record's summary: each sub-field set to something other than its default, in the order the editor lists them.
 * A record at its defaults reads as "Defaults".
 */
export function summarizeRecord(fields: ServiceSettingField[],
                                values: Record<string, ServiceSettingFieldValue>): string {
    const parts = fields
        .filter((field) => values[field.name] !== undefined && !isDefault(field, values[field.name]))
        .map((field) => {
            const value = values[field.name];
            if (field.kind === "toggle") {
                return `${field.label}: ${value ? "On" : "Off"}`;
            }
            return `${field.label}: ${Array.isArray(value) ? value.join(", ") : String(value)}`;
        });
    return parts.length > 0 ? parts.join(" · ") : "Defaults";
}

/** Whether the value equals the sub-field's default. */
export function isDefault(field: ServiceSettingField, value: ServiceSettingFieldValue): boolean {
    return field.defaultValue !== undefined && JSON.stringify(field.defaultValue) === JSON.stringify(value);
}

/**
 * Whether the panel can edit the setting. A field with no editor of its own, and a record set to something other
 * than plain literals, are edited in the full service config form instead.
 */
export function isEditableInPanel(setting: ServiceSetting): boolean {
    return setting.editorKind !== "advanced" && setting.structured !== false;
}

/** The badge summary of the settings set on a service: one entry per set setting. */
export function toBadgeSummary(settings: ServiceSetting[]): { items: { label: string; summary: string }[] } {
    return {
        items: setSettings(settings).map((setting) => ({ label: setting.label, summary: summarize(setting) })),
    };
}

/** Whether the text is a whole number of at least 1, which a count setting such as a query depth needs. */
export function isPositiveInteger(text: string): boolean {
    return /^[1-9][0-9]*$/.test(text.trim());
}

/** The toggle state of a setting: its value when set, else the module's default, else off. */
export function toggleState(setting: ServiceSetting): boolean {
    const value = (isSet(setting) ? setting.value : setting.defaultValue)?.trim();
    return value === "true";
}
