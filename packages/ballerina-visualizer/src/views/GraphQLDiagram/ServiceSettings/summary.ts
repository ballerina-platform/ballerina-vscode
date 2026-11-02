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

import type { ServiceSetting } from "@wso2/ballerina-core";

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
    const value = setting.value.trim();
    if (setting.editorKind === "toggle") {
        if (value === "true") {
            return "On";
        }
        if (value === "false") {
            return "Off";
        }
    }
    const oneLine = value.replace(/\s+/g, " ");
    return oneLine.length > MAX_SUMMARY_LENGTH ? `${oneLine.slice(0, MAX_SUMMARY_LENGTH - 1)}…` : oneLine;
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
