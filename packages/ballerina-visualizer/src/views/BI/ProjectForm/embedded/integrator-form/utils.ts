/**
 * Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
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

import { AddProjectFormData } from "./types";

export const ORG_NAME_MAX_LENGTH = 30;
export const PROJECT_HANDLE_MAX_LENGTH = 63;
export const COMPONENT_NAME_MAX_LENGTH = 60;
export const PACKAGE_NAME_MAX_LENGTH = 256;

export const isValidPackageName = (name: string): boolean => {
    return /^[a-z0-9_.]+$/.test(name);
};

export const validatePackageName = (name: string, integrationName: string): string | null => {
    if (integrationName.length === 0 && name.length === 0) {
        return null;
    }

    if (name.length === 0) {
        return "Package name is required";
    }

    if (!isValidPackageName(name)) {
        return "Package name can only contain lowercase letters, numbers, underscores, and dots";
    }

    if (name.startsWith("_")) {
        return "Package name cannot start with an underscore";
    }

    if (/__/.test(name)) {
        return "Package name cannot have consecutive underscores";
    }

    if (/\.{2,}/.test(name)) {
        return "Package name cannot have consecutive dots";
    }

    if (name.endsWith("_")) {
        return "Package name cannot end with an underscore";
    }

    if (name.endsWith(".")) {
        return "Package name cannot end with a dot";
    }

    if (name.length > PACKAGE_NAME_MAX_LENGTH) {
        return `Package name cannot exceed ${PACKAGE_NAME_MAX_LENGTH} characters`;
    }

    return null; // No error
};

export const isFormValidAddProject = (formData: AddProjectFormData, isInProject: boolean): boolean => {
    return (
        formData.integrationName.length >= 2 &&
        formData.packageName.length >= 2 &&
        (isInProject || (formData.workspaceName?.length ?? 0) >= 1) &&
        validatePackageName(formData.packageName, formData.integrationName) === null &&
        validateOrgName(formData.orgName) === null
    );
};

/**
 * Validates a project name string.
 * Returns an error message, or null if valid.
 */
export const validateProjectName = (name: string): string | null => {
    if (!name || name.length === 0) {
        return "Project name is required";
    }
    if (!/^[a-zA-Z]/.test(name)) {
        return "Project name must start with an alphabetic letter";
    }
    if (!/^[a-zA-Z0-9 _-]+$/.test(name)) {
        return "Project name cannot contain special characters";
    }
    const letterCount = (name.match(/[a-zA-Z]/g) || []).length;
    if (letterCount < 3) {
        return "Project name must contain at least three letters";
    }
    return null;
};

/**
 * Validates an integration or library name string.
 * Returns the first failing rule's error message, or null if the name is valid.
 */
export const validateComponentName = (name: string): string | null => {
    if (!name || name.length === 0) {
        return `Name is required`;
    }
    const trimmed = name.trim();
    if (!/^[a-zA-Z]/.test(trimmed)) {
        return `Name must start with an alphabetic letter`;
    }
    if (!/^[a-zA-Z0-9 _-]+$/.test(trimmed)) {
        return `Name cannot contain special characters`;
    }
    if (trimmed.length < 3) {
        return `Name must be least 3 characters`;
    }
    if (trimmed.length > COMPONENT_NAME_MAX_LENGTH) {
        return `Name cannot exceed ${COMPONENT_NAME_MAX_LENGTH} characters`;
    }
    return null;
};

/**
 * Cross-platform path joining for webview display.
 * Detects the path separator from the base string itself.
 */
export const joinPath = (base: string, name: string): string => {
    if (!base) return '';
    if (!name) return base;
    const sep = base.includes('\\') ? '\\' : '/';
    const trimmed = base.endsWith(sep) ? base.slice(0, -1) : base;
    return `${trimmed}${sep}${name}`;
};

/**
 * Extracts the base (parent) directory from a full path that may have `name` appended.
 * If the path ends with `/name` or `\name`, strips it. Otherwise strips the last component.
 */
export const extractBase = (value: string, name: string): string => {
    if (!value) return value;
    if (name) {
        if (value.endsWith('/' + name)) {
            const base = value.slice(0, -(name.length + 1));
            return base || '/';
        }
        if (value.endsWith('\\' + name)) {
            const base = value.slice(0, -(name.length + 1));
            return base || '\\';
        }
    }
    const lastSep = Math.max(value.lastIndexOf('/'), value.lastIndexOf('\\'));
    if (lastSep < 0) return value;
    if (lastSep === 0) return value.slice(0, 1);
    return value.slice(0, lastSep);
};


export const sanitizePackageName = (name: string): string => {
    // Allow dots/underscores but sanitize other characters, then convert consecutive dots/underscores to single ones
    return name
        .replace(/[^a-z0-9._]/gi, "_")
        .toLowerCase()
        .replace(/\.{2,}/g, ".") // Convert multiple consecutive dots to single dot
        .replace(/_{2,}/g, "_"); // Convert multiple consecutive underscores to single underscore
};

/**
 * Sanitizes a string into a valid project handle.
 * Pass `trimTrailing: true` (default) to also strip trailing hyphens — use this when
 * deriving a handle programmatically. Pass `false` for live keystroke input so that a
 * typed space is immediately visible as '-' while the user is mid-word.
 */
export const sanitizeProjectHandle = (name: string, { trimTrailing = true } = {}): string => {
    let result = name
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")        // replace anything non-alphanumeric with hyphen
        .replace(/-{2,}/g, "-")              // collapse consecutive hyphens
        .replace(/^-+/, "")                  // trim leading hyphens
        .slice(0, PROJECT_HANDLE_MAX_LENGTH);
    if (trimTrailing) {
        result = result.replace(/-+$/, "");
    }
    return result;
};

/**
 * Sanitizes a string into a valid org handle.
 * Rules: lowercase alphanumeric only (no hyphens, underscores, or spaces);
 * cannot start with a digit; max 29 characters.
 */
export const sanitizeOrgHandle = (name: string): string => {
    const stripped = name
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")          // keep only lowercase letters and digits
        .replace(/^[0-9]+/, "");            // strip leading digits
    return stripped;
};

/**
 * Validates a project handle string.
 * Returns an error message, or null if valid.
 */
export const validateProjectHandle = (handle: string): string | null => {
    if (!handle || handle.length === 0) {
        return "Project handle is required";
    }
    if (!/^[a-zA-Z0-9]/.test(handle)) {
        return "Project handle must start with an alphanumeric character";
    }
    if (!/^[a-z0-9-]+$/.test(handle)) {
        return "Project handle can only contain lowercase letters, digits, or hyphens";
    }
    if (handle.length < 2) {
        return "Project handle must be at least 2 characters";
    }
    if (handle.length > PROJECT_HANDLE_MAX_LENGTH) {
        return `Project handle cannot exceed ${PROJECT_HANDLE_MAX_LENGTH} characters`;
    }
    if (handle.endsWith("-")) {
        return "Project handle cannot end with a hyphen";
    }
    return null;
};

// Reserved organization names
const RESERVED_ORG_NAMES = ["ballerina", "ballerinax", "wso2"];

// Org name pattern (based on Ballerina language specification for RestrictedIdentifier)
// RestrictedIdentifier := AsciiLetter RestrictedFollowingChar* RestrictedIdentifierWord*
// RestrictedIdentifierWord := _ RestrictedFollowingChar+
// RestrictedFollowingChar := AsciiLetter | Digit
// AsciiLetter := A .. Z | a .. z
const RESTRICTED_IDENTIFIER_REGEX = /^[a-zA-Z][a-zA-Z0-9]*(_[a-zA-Z0-9]+)*$/;

/**
 * Suggests the next available project name by appending a numeric suffix.
 * Tries base-2, base-3, ... until a name not in existingNames is found.
 */
export const suggestAvailableProjectName = (base: string, existingNames: string[]): string => {
    const lower = existingNames.map(n => n.toLowerCase());
    let i = 2;
    let candidate = `${base}-${i}`;
    while (lower.includes(candidate.toLowerCase())) {
        i++;
        candidate = `${base}-${i}`;
    }
    return candidate;
};

export const validateOrgName = (orgName: string): string | null => {
    if (!orgName || orgName.length === 0) {
        return "Organization name is required";
    }

    // Check for reserved org names (case-insensitive)
    if (RESERVED_ORG_NAMES.includes(orgName.toLowerCase())) {
        return `"${orgName}" is a reserved organization name`;
    }

    // Length check must run outside the pattern branch below — an otherwise-valid
    // identifier that is simply too long passes RESTRICTED_IDENTIFIER_REGEX, so the
    // in-branch length check was unreachable for exactly the names it should catch.
    if (orgName.length > ORG_NAME_MAX_LENGTH) {
        return `Organization name cannot exceed ${ORG_NAME_MAX_LENGTH} characters`;
    }

    // Validate against RestrictedIdentifier pattern
    if (!RESTRICTED_IDENTIFIER_REGEX.test(orgName)) {
        if (!/^[a-zA-Z]/.test(orgName)) {
            return "Organization name must start with a letter (a-z, A-Z)";
        }
        if (orgName.includes("__")) {
            return "Organization name cannot have consecutive underscores";
        }
        if (orgName.endsWith("_")) {
            return "Organization name cannot end with an underscore";
        }
        if (/_[^a-zA-Z0-9]/.test(orgName)) {
            return "Underscore must be followed by at least one letter or digit";
        }
        return "Organization name can only contain letters (a-z, A-Z), digits (0-9), and underscores";
    }

    return null;
};
