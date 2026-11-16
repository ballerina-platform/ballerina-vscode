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
 * software distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import * as fs from 'fs';
import * as path from 'path';
import { parse, stringify } from '@iarna/toml';
import { OTLP_PORT } from './constants';

// Tracing provider bundled with the Ballerina runtime from 2201.14.0 onwards; no import is needed.
const TRACING_PROVIDER = 'otel';

// Keys the extension writes to [ballerina.otel] so traces reach the local trace server.
const OTEL_TRACE_CONFIG = {
    tracesProtocol: 'http/protobuf',
    tracesEndpoint: `http://localhost:${OTLP_PORT}/v1/traces`
};

// Previous setup: trace_enabled.bal imports ballerinax/idetraceprovider. Projects that already
// use it keep it until tracing is disabled.
const LEGACY_TRACE_FILE = 'trace_enabled.bal';
const LEGACY_TRACING_PROVIDER = 'idetraceprovider';
const LEGACY_PROVIDER_SECTION = 'ballerinax.idetraceprovider';

// Marks a user's own line that enabling tracing replaced, so disabling can put it back.
const SAVED_LINE_PREFIX = '# saved by IDE tracing: ';

/**
 * Checks whether tracing is enabled for the given project.
 * Tracing is enabled when Config.toml has [ballerina.observe] tracingEnabled = true with the otel provider
 * exporting to the IDE's trace server (not a collector of the project's own), or when the project uses the legacy trace_enabled.bal setup.
 *
 * @param projectPath The project directory containing Config.toml
 * @returns true if tracing is enabled for the project
 */
export function isTracingEnabled(projectPath: string): boolean {
    if (fs.existsSync(path.join(projectPath, LEGACY_TRACE_FILE))) {
        return true;
    }
    const configFilePath = path.join(projectPath, 'Config.toml');
    if (!fs.existsSync(configFilePath)) {
        return false;
    }
    let parsedConfig: any;
    try {
        parsedConfig = parseConfig(fs.readFileSync(configFilePath, 'utf-8'));
    } catch (error) {
        console.error('Failed to read Config.toml:', error);
        return false;
    }
    const observe = parsedConfig?.ballerina?.observe;
    return observe?.tracingEnabled === true && observe?.tracingProvider === TRACING_PROVIDER
        && exportsToTraceServer(parsedConfig);
}

/**
 * Parses Config.toml content, returning undefined if it is not valid TOML
 *
 * @param content Config.toml content
 * @returns The parsed config, or undefined
 */
function parseConfig(content: string): any {
    try {
        return parse(content);
    } catch (error) {
        console.error('Failed to parse Config.toml:', error);
        return undefined;
    }
}

/**
 * Checks whether the config sends traces to the IDE's trace server rather than to a collector of the user's own
 *
 * @param parsedConfig The parsed Config.toml
 * @returns true if [ballerina.otel] tracesEndpoint is the IDE's endpoint
 */
function exportsToTraceServer(parsedConfig: any): boolean {
    return parsedConfig?.ballerina?.otel?.tracesEndpoint === OTEL_TRACE_CONFIG.tracesEndpoint;
}

/**
 * Checks whether the config was set up by the IDE, through either the otel or the legacy provider
 *
 * @param parsedConfig The parsed Config.toml
 * @returns true if the tracing settings in the config are the IDE's
 */
function usesIdeTracing(parsedConfig: any): boolean {
    return exportsToTraceServer(parsedConfig)
        || parsedConfig?.ballerina?.observe?.tracingProvider === LEGACY_TRACING_PROVIDER;
}

/**
 * Sets tracing configuration in Config.toml and Ballerina.toml files
 *
 * This function will:
 * - Read existing Config.toml if it exists
 * - Update or add [ballerina.observe] section with tracingEnabled = true and tracingProvider = "otel"
 * - Update or add [ballerina.otel] section to export traces to "http://localhost:<port>/v1/traces"
 * - Remove a stale legacy [ballerinax.idetraceprovider] section
 * - For a project that already uses the legacy trace_enabled.bal setup, keep tracingProvider = "idetraceprovider"
 *   and leave [ballerina.otel] untouched instead
 * - Read existing Ballerina.toml if it exists
 * - Update or add [build-options] section with observabilityIncluded = true
 * - Keep each replaced line as a comment, so removeTracingConfig can restore it
 * - Preserve all other existing configuration
 *
 * @param workspaceDir The workspace directory where Config.toml and Ballerina.toml should be created/updated
 * @returns Promise<void> Resolves when configuration is successfully written
 * @throws Error if file operations fail
 */
export async function setTracingConfig(workspaceDir: string): Promise<void> {
    // Update Config.toml
    const configFilePath = path.join(workspaceDir, 'Config.toml');

    // Read existing Config.toml content if it exists
    let updatedContent = '';
    if (fs.existsSync(configFilePath)) {
        try {
            updatedContent = fs.readFileSync(configFilePath, 'utf-8');
        } catch (error) {
            console.error('Failed to read existing Config.toml:', error);
            // Continue with empty content if reading fails
        }
    }

    const usesLegacySetup = fs.existsSync(path.join(workspaceDir, LEGACY_TRACE_FILE));
    // Lines are only the user's own the first time; on a re-enable they are ours.
    const saveReplaced = !usesIdeTracing(parseConfig(updatedContent));
    if (!usesLegacySetup) {
        updatedContent = removeSection(updatedContent, LEGACY_PROVIDER_SECTION);
    }
    updatedContent = updateOrAddSection(
        updatedContent,
        'ballerina.observe',
        {
            tracingEnabled: true,
            tracingProvider: usesLegacySetup ? LEGACY_TRACING_PROVIDER : TRACING_PROVIDER
        },
        saveReplaced
    );
    if (!usesLegacySetup) {
        updatedContent = updateOrAddSection(updatedContent, 'ballerina.otel', OTEL_TRACE_CONFIG, saveReplaced);
    }

    // Ensure file ends with newline
    if (!updatedContent.endsWith('\n')) {
        updatedContent += '\n';
    }

    // Write the updated content to Config.toml
    fs.writeFileSync(configFilePath, updatedContent, 'utf-8');

    // Update Ballerina.toml
    const ballerinaTomlPath = path.join(workspaceDir, 'Ballerina.toml');
    
    // Read existing Ballerina.toml content if it exists
    let ballerinaTomlContent = '';
    if (fs.existsSync(ballerinaTomlPath)) {
        try {
            ballerinaTomlContent = fs.readFileSync(ballerinaTomlPath, 'utf-8');
        } catch (error) {
            console.error('Failed to read existing Ballerina.toml:', error);
            // Continue with empty content if reading fails
        }
    }
    
    // Update or add [build-options] section with observabilityIncluded = true
    ballerinaTomlContent = updateOrAddSection(
        ballerinaTomlContent,
        'build-options',
        {
            observabilityIncluded: true
        },
        saveReplaced
    );
    
    // Ensure file ends with newline
    if (!ballerinaTomlContent.endsWith('\n')) {
        ballerinaTomlContent += '\n';
    }
    
    // Write the updated content to Ballerina.toml
    fs.writeFileSync(ballerinaTomlPath, ballerinaTomlContent, 'utf-8');
}

/**
 * Deletes the trace_enabled.bal file used by the legacy idetraceprovider setup, if present
 *
 * @param projectPath The project directory
 */
function removeLegacyTraceFile(projectPath: string): void {
    const legacyFilePath = path.join(projectPath, LEGACY_TRACE_FILE);
    if (fs.existsSync(legacyFilePath)) {
        fs.unlinkSync(legacyFilePath);
    }
}

/**
 * Updates an existing TOML section or adds it if it doesn't exist
 * 
 * @param content Original TOML content
 * @param sectionName Section name (e.g., 'ballerina.observe')
 * @param values Object with key-value pairs to set in the section
 * @param saveReplaced Keep each replaced line as a comment, unless one is already saved for that key
 * @returns Updated TOML content
 */
function updateOrAddSection(
    content: string, sectionName: string, values: Record<string, any>, saveReplaced = false
): string {
    const sectionHeader = `[${sectionName}]`;
    const lines = content.split('\n');
    const sectionStartIndex = lines.findIndex(line => line.trim() === sectionHeader);

    // Build formatted key=value lines for the new values
    const keyPatterns = new Map(
        Object.keys(values).map(key => [
            key,
            new RegExp(`^\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=`)
        ])
    );
    const formatEntry = (key: string, value: any) => `${key} = ${stringify.value(value)}`;

    if (sectionStartIndex !== -1) {
        // Section exists - find where it ends
        let sectionEndIndex = lines.length;
        for (let i = sectionStartIndex + 1; i < lines.length; i++) {
            const trimmed = lines[i].trim();
            if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
                sectionEndIndex = i;
                break;
            }
        }

        // Merge: update matching keys in place, preserve everything else
        const mergedKeys = new Set<string>();
        const existingLines = lines.slice(sectionStartIndex + 1, sectionEndIndex);

        const savedKeys = new Set(
            Object.keys(values).filter(key => existingLines.some(line => isSavedLineFor(line, keyPatterns.get(key)!)))
        );

        const updatedLines = existingLines.flatMap(line => {
            const trimmed = line.trim();
            if (trimmed === '' || trimmed.startsWith('#')) {
                return [line];
            }
            for (const [key, pattern] of keyPatterns) {
                if (pattern.test(trimmed)) {
                    mergedKeys.add(key);
                    const entry = formatEntry(key, values[key]);
                    if (saveReplaced && !savedKeys.has(key)) {
                        return [`${SAVED_LINE_PREFIX}${trimmed}`, entry];
                    }
                    return [entry];
                }
            }
            return [line];
        });

        // Strip trailing blank lines so new keys sit directly after existing ones
        while (updatedLines.length > 0 && updatedLines[updatedLines.length - 1].trim() === '') {
            updatedLines.pop();
        }

        // Append keys that weren't already in the section
        for (const [key, value] of Object.entries(values)) {
            if (!mergedKeys.has(key)) {
                updatedLines.push(formatEntry(key, value));
            }
        }

        // Keep a blank line between this section and the next one
        if (sectionEndIndex < lines.length) {
            updatedLines.push('');
        }

        return [
            ...lines.slice(0, sectionStartIndex),
            sectionHeader,
            ...updatedLines,
            ...lines.slice(sectionEndIndex),
        ].join('\n');
    }

    // Section doesn't exist - strip trailing blank lines and append new section
    while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
        lines.pop();
    }
    if (lines.length > 0) {
        lines.push('');
    }
    lines.push(sectionHeader);
    for (const [key, value] of Object.entries(values)) {
        lines.push(formatEntry(key, value));
    }

    return lines.join('\n');
}

/**
 * Checks whether a line is a saved copy of a key's original line
 *
 * @param line The TOML line
 * @param keyPattern Pattern matching the key's assignment
 * @returns true if the line was saved by updateOrAddSection for that key
 */
function isSavedLineFor(line: string, keyPattern: RegExp): boolean {
    const trimmed = line.trim();
    return trimmed.startsWith(SAVED_LINE_PREFIX) && keyPattern.test(trimmed.slice(SAVED_LINE_PREFIX.length));
}

/**
 * Removes tracing configuration from Config.toml and Ballerina.toml files
 * 
 * This function will:
 * - Read existing Config.toml if it exists
 * - Remove tracingEnabled and tracingProvider from [ballerina.observe] section
 *   (removes the entire section if it becomes empty)
 * - Remove the trace export keys from [ballerina.otel] section
 *   (removes the entire section if it becomes empty)
 * - Remove the legacy [ballerinax.idetraceprovider] section and trace_enabled.bal file
 * - Read existing Ballerina.toml if it exists
 * - Remove observabilityIncluded from [build-options] section
 *   (removes the entire section if it becomes empty)
 * - Restore the lines setTracingConfig replaced
 * - Leave [ballerina.observe], [ballerina.otel] and Ballerina.toml untouched when the project exports
 *   traces to a collector of its own rather than to the IDE
 * - Preserve all other existing configuration
 * 
 * @param workspaceDir The workspace directory where Config.toml and Ballerina.toml should be updated
 * @returns Promise<void> Resolves when configuration is successfully written
 * @throws Error if file operations fail
 */
export async function removeTracingConfig(workspaceDir: string): Promise<void> {
    removeLegacyTraceFile(workspaceDir);

    // Remove from Config.toml
    const configFilePath = path.join(workspaceDir, 'Config.toml');

    // If file doesn't exist, nothing to do
    if (!fs.existsSync(configFilePath)) {
        return;
    }
    
    // Read existing Config.toml content
    let existingContent = '';
    try {
        existingContent = fs.readFileSync(configFilePath, 'utf-8');
    } catch (error) {
        console.error('Failed to read Config.toml:', error);
        throw error;
    }
    
    // Remove the tracing configuration sections
    let updatedContent = removeSection(existingContent, LEGACY_PROVIDER_SECTION);

    if (!usesIdeTracing(parseConfig(existingContent))) {
        // The project's own exporter setup, not ours to remove.
        if (updatedContent !== existingContent) {
            fs.writeFileSync(configFilePath, updatedContent, 'utf-8');
        }
        return;
    }

    // Remove trace export keys from [ballerina.otel] section
    updatedContent = removeKeysFromSection(
        updatedContent,
        'ballerina.otel',
        Object.keys(OTEL_TRACE_CONFIG)
    );

    // Remove tracing keys from [ballerina.observe] section
    updatedContent = removeKeysFromSection(
        updatedContent,
        'ballerina.observe',
        ['tracingEnabled', 'tracingProvider']
    );
    
    // Clean up trailing newlines but ensure file ends with one
    updatedContent = updatedContent.trimEnd();
    if (updatedContent.length > 0 && !updatedContent.endsWith('\n')) {
        updatedContent += '\n';
    }
    
    // Write the updated content to Config.toml
    fs.writeFileSync(configFilePath, updatedContent, 'utf-8');
    
    // Remove from Ballerina.toml
    const ballerinaTomlPath = path.join(workspaceDir, 'Ballerina.toml');
    
    // If file doesn't exist, nothing to do
    if (!fs.existsSync(ballerinaTomlPath)) {
        return;
    }
    
    // Read existing Ballerina.toml content
    let ballerinaTomlContent = '';
    try {
        ballerinaTomlContent = fs.readFileSync(ballerinaTomlPath, 'utf-8');
    } catch (error) {
        console.error('Failed to read Ballerina.toml:', error);
        throw error;
    }
    
    // Remove observabilityIncluded from [build-options] section
    ballerinaTomlContent = removeKeysFromSection(
        ballerinaTomlContent,
        'build-options',
        ['observabilityIncluded']
    );
    
    // Clean up trailing newlines but ensure file ends with one
    ballerinaTomlContent = ballerinaTomlContent.trimEnd();
    if (ballerinaTomlContent.length > 0 && !ballerinaTomlContent.endsWith('\n')) {
        ballerinaTomlContent += '\n';
    }
    
    // Write the updated content to Ballerina.toml
    fs.writeFileSync(ballerinaTomlPath, ballerinaTomlContent, 'utf-8');
}

/**
 * Removes an entire section from TOML content
 * 
 * @param content Original TOML content
 * @param sectionName Section name (e.g., 'ballerinax.idetraceprovider')
 * @returns Updated TOML content with section removed
 */
function removeSection(content: string, sectionName: string): string {
    const sectionHeader = `[${sectionName}]`;
    const lines = content.split('\n');
    const sectionStartIndex = lines.findIndex(line => line.trim() === sectionHeader);
    
    if (sectionStartIndex === -1) {
        // Section doesn't exist, return original content
        return content;
    }
    
    // Find where the section ends
    let sectionEndIndex = lines.length;
    for (let i = sectionStartIndex + 1; i < lines.length; i++) {
        const trimmedLine = lines[i].trim();
        // Check if this is the start of a new section
        if (trimmedLine.startsWith('[') && trimmedLine.endsWith(']')) {
            sectionEndIndex = i;
            break;
        }
    }
    
    // Remove the section
    const beforeSection = lines.slice(0, sectionStartIndex);
    const afterSection = lines.slice(sectionEndIndex);
    
    // Combine before and after, removing extra empty lines
    const resultLines: string[] = [];
    
    if (beforeSection.length > 0) {
        resultLines.push(...beforeSection);
    }
    
    if (afterSection.length > 0) {
        // Remove trailing empty line from before section if present
        if (resultLines.length > 0 && resultLines[resultLines.length - 1].trim() === '') {
            resultLines.pop();
        }
        // Remove leading empty line from after section if present
        let afterStart = 0;
        if (afterSection[0]?.trim() === '') {
            afterStart = 1;
        }
        resultLines.push(...afterSection.slice(afterStart));
    }
    
    return resultLines.join('\n');
}

/**
 * Removes specific keys from a TOML section, restoring any line updateOrAddSection saved for them
 * If the section becomes empty after removing keys, removes the entire section
 * 
 * @param content Original TOML content
 * @param sectionName Section name (e.g., 'ballerina.observe')
 * @param keysToRemove Array of keys to remove from the section
 * @returns Updated TOML content with keys removed
 */
function removeKeysFromSection(content: string, sectionName: string, keysToRemove: string[]): string {
    const sectionHeader = `[${sectionName}]`;
    const lines = content.split('\n');
    const sectionStartIndex = lines.findIndex(line => line.trim() === sectionHeader);
    
    if (sectionStartIndex === -1) {
        // Section doesn't exist, return original content
        return content;
    }
    
    // Find where the section ends
    let sectionEndIndex = lines.length;
    for (let i = sectionStartIndex + 1; i < lines.length; i++) {
        const trimmedLine = lines[i].trim();
        // Check if this is the start of a new section
        if (trimmedLine.startsWith('[') && trimmedLine.endsWith(']')) {
            sectionEndIndex = i;
            break;
        }
    }
    
    // Extract section lines
    const sectionLines = lines.slice(sectionStartIndex, sectionEndIndex);
    
    // Match key = value (with or without quotes, with or without spaces)
    const keyPatterns = keysToRemove.map(
        key => new RegExp(`^\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=`)
    );

    // Remove keys from section, then restore the lines they replaced
    const remainingLines = sectionLines
        .filter(line => {
            const trimmedLine = line.trim();
            // Keep the section header
            if (trimmedLine === sectionHeader) {
                return true;
            }
            // Remove lines that set a key we want to remove, keep all others
            return !keyPatterns.some(pattern => pattern.test(trimmedLine));
        })
        .map(line => keyPatterns.some(pattern => isSavedLineFor(line, pattern))
            ? line.trim().slice(SAVED_LINE_PREFIX.length)
            : line);
    
    // Check if section is empty (only header remains)
    const hasContent = remainingLines.some((line, index) => {
        // Skip the header line
        return index > 0 && line.trim() !== '';
    });
    
    // If section is empty, remove the entire section
    if (!hasContent) {
        return removeSection(content, sectionName);
    }
    
    // Rebuild content with remaining section lines
    const beforeSection = lines.slice(0, sectionStartIndex);
    const afterSection = lines.slice(sectionEndIndex);
    
    const resultLines: string[] = [];
    if (beforeSection.length > 0) {
        resultLines.push(...beforeSection);
    }
    resultLines.push(...remainingLines);
    if (afterSection.length > 0) {
        resultLines.push(...afterSection);
    }
    
    return resultLines.join('\n');
}

