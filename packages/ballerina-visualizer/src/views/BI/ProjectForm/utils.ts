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

export const PROJECT_HANDLE_MAX_LENGTH = 63;
export const COMPONENT_NAME_MAX_LENGTH = 60;

export const sanitizeProjectHandle = (name: string, { trimTrailing = true } = {}): string => {
    let result = name
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-{2,}/g, "-")
        .replace(/^-+/, "")
        .slice(0, PROJECT_HANDLE_MAX_LENGTH);
    if (trimTrailing) {
        result = result.replace(/-+$/, "");
    }
    return result;
};

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

    if (name.length < 2) {
        return `Package name must be at least 2 characters`;
    }

    if (name.endsWith(".")) {
        return "Package name cannot end with a dot";
    }

    if (name.length > 256) {
        return "Package name cannot exceed 256 characters";
    }

    return null; // No error
};

export const validateComponentName = (name: string, isLibrary: boolean): string | null => {
    const componentType = isLibrary ? "Library" : "Integration";

    if (!name || name.length === 0) {
        return `${componentType} name is required`;
    }
    if (!/^[a-zA-Z]/.test(name)) {
        return `${componentType} name must start with an alphabetic letter`;
    }
    if (!/^[a-zA-Z0-9 _-]+$/.test(name)) {
        return `${componentType} name cannot contain special characters`;
    }
    if (name.length < 3) {
        return `${componentType} name must be at least 3 characters`;
    }
    if (name.length > COMPONENT_NAME_MAX_LENGTH) {
        return `${componentType} name cannot exceed ${COMPONENT_NAME_MAX_LENGTH} characters`;
    }
    return null;
};

export const isFormValidAddProject = (formData: AddProjectFormData, isInProject: boolean): boolean => {
    return (
        (isInProject || (formData.workspaceName?.length ?? 0) >= 1) &&
        validateComponentName(formData.integrationName, formData.isLibrary) === null &&
        validatePackageName(formData.packageName, formData.integrationName) === null &&
        validateOrgName(formData.orgName) === null &&
        (formData.projectHandle === undefined || validateProjectHandle(formData.projectHandle) === null)
    );
};

export const sanitizePackageName = (name: string): string => {
    // Allow dots/underscores but sanitize other characters, then convert consecutive dots/underscores to single ones
    return name
        .replace(/[^a-z0-9._]/gi, "_")
        .toLowerCase()
        .replace(/\.{2,}/g, ".") // Convert multiple consecutive dots to single dot
        .replace(/_{2,}/g, "_"); // Convert multiple consecutive underscores to single underscore
};

export const toPascalCase = (value: string): string => {
    return value
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2") // split camelCase/PascalCase boundaries
        .split(/[^a-zA-Z0-9]+/)
        .filter(Boolean)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join("")
        .replace(/^[0-9]+/, ""); // identifiers cannot start with a digit
};

export const toSnakeCasePackageName = (value: string): string => {
    return value
        .replace(/([a-z0-9])([A-Z])/g, "$1_$2") // camelCase boundary
        .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2") // acronym boundary (HTTPClient -> HTTP_Client)
        .replace(/[^a-zA-Z0-9]+/g, "_") // separators -> underscore
        .toLowerCase()
        .replace(/_{2,}/g, "_")
        .replace(/^_+/, "")
        .replace(/_+$/, "");
};

// Reserved organization names
const RESERVED_ORG_NAMES = ["ballerina", "ballerinax", "wso2"];

// Org name pattern (based on Ballerina language specification for RestrictedIdentifier)
// RestrictedIdentifier := AsciiLetter RestrictedFollowingChar* RestrictedIdentifierWord*
// RestrictedIdentifierWord := _ RestrictedFollowingChar+
// RestrictedFollowingChar := AsciiLetter | Digit
// AsciiLetter := A .. Z | a .. z
const RESTRICTED_IDENTIFIER_REGEX = /^[a-zA-Z][a-zA-Z0-9]*(_[a-zA-Z0-9]+)*$/;

export const validateOrgName = (orgName: string): string | null => {
    if (!orgName || orgName.length === 0) {
        return "Organization name is required";
    }

    // Check for reserved org names (case-insensitive)
    if (RESERVED_ORG_NAMES.includes(orgName.toLowerCase())) {
        return `"${orgName}" is a reserved organization name`;
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

/**
 * Sanitizes a string into a valid org handle.
 * Rules: lowercase alphanumeric only (no hyphens, underscores, or spaces);
 * cannot start with a digit;
 */
export const sanitizeOrgHandle = (name: string): string => {
    const sanitized = name
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")          // keep only lowercase letters and digits
        .replace(/^[0-9]+/, "");            // strip leading digits
    return sanitized;
};
