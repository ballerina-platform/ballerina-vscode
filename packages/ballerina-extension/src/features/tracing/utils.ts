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
import { TracingProvider } from '@wso2/ballerina-core';
import { OTLP_PORT } from './constants';

/**
 * Sets tracing configuration in Config.toml and Ballerina.toml files
 *
 * This function will:
 * - Read existing Config.toml if it exists
 * - Update or add [ballerina.observe] section with tracingEnabled = true and tracingProvider = "idetraceprovider" or "amp"
 * - Read existing Ballerina.toml if it exists
 * - Update or add [build-options] section with observabilityIncluded = true
 * - Preserve all other existing configuration
 *
 * Note: this does NOT create a [ballerinax.amp] section — those otelEndpoint/apiKey values are
 * only written once the user fills them in through the configurable-variables panel.
 *
 * @param workspaceDir The workspace directory where Config.toml and Ballerina.toml should be created/updated
 * @param provider The tracing provider to configure, defaults to "idetraceprovider"
 * @returns Promise<void> Resolves when configuration is successfully written
 * @throws Error if file operations fail
 */
export async function setTracingConfig(workspaceDir: string, provider: TracingProvider = 'idetraceprovider'): Promise<void> {
    // Update Config.toml
    const configFilePath = path.join(workspaceDir, 'Config.toml');
    
    // Read existing Config.toml content if it exists
    let existingContent = '';
    let parsedConfig: any = {};
    
    if (fs.existsSync(configFilePath)) {
        try {
            existingContent = fs.readFileSync(configFilePath, 'utf-8');
            parsedConfig = parse(existingContent);
        } catch (error) {
            console.error('Failed to parse existing Config.toml:', error);
            // Continue with empty config if parsing fails
        }
    }
    
    // Update the parsed config object
    if (!parsedConfig['ballerina']) {
        parsedConfig['ballerina'] = {};
    }
    if (!parsedConfig['ballerina']['observe']) {
        parsedConfig['ballerina']['observe'] = {};
    }
    
    parsedConfig['ballerina']['observe']['tracingEnabled'] = true;
    parsedConfig['ballerina']['observe']['tracingProvider'] = provider;

    // Convert the updated config object back to TOML string
    const updatedContent = convertObjectToToml(parsedConfig, existingContent);

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
        }
    );
    
    // Ensure file ends with newline
    if (!ballerinaTomlContent.endsWith('\n')) {
        ballerinaTomlContent += '\n';
    }
    
    // Write the updated content to Ballerina.toml
    fs.writeFileSync(ballerinaTomlPath, ballerinaTomlContent, 'utf-8');
}

/**
 * Converts a JavaScript object to TOML format string
 * Uses a simpler approach: updates existing sections or appends new ones
 * 
 * @param config The parsed config object
 * @param originalContent Original TOML content for reference
 * @returns TOML formatted string
 */
function convertObjectToToml(config: any, originalContent: string): string {
    let updatedContent = originalContent || '';

    // Update or add [ballerina.observe] section
    updatedContent = updateOrAddSection(
        updatedContent,
        'ballerina.observe',
        {
            tracingEnabled: config.ballerina?.observe?.tracingEnabled ?? true,
            tracingProvider: config.ballerina?.observe?.tracingProvider ?? 'idetraceprovider'
        }
    );

    // Ensure file ends with newline
    if (!updatedContent.endsWith('\n')) {
        updatedContent += '\n';
    }

    return updatedContent;
}

/**
 * Updates an existing TOML section or adds it if it doesn't exist
 * 
 * @param content Original TOML content
 * @param sectionName Section name (e.g., 'ballerina.observe')
 * @param values Object with key-value pairs to set in the section
 * @returns Updated TOML content
 */
function updateOrAddSection(content: string, sectionName: string, values: Record<string, any>): string {
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

        const updatedLines = existingLines.map(line => {
            const trimmed = line.trim();
            if (trimmed === '' || trimmed.startsWith('#')) {
                return line;
            }
            for (const [key, pattern] of keyPatterns) {
                if (pattern.test(trimmed)) {
                    mergedKeys.add(key);
                    return formatEntry(key, values[key]);
                }
            }
            return line;
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
 * Removes tracing configuration from Config.toml and Ballerina.toml files
 * 
 * This function will:
 * - Read existing Config.toml if it exists
 * - Remove tracingEnabled and tracingProvider from [ballerina.observe] section
 *   (removes the entire section if it becomes empty)
 * - Remove the entire [ballerinax.idetraceprovider] and [ballerinax.amp] sections
 * - Read existing Ballerina.toml if it exists
 * - Remove observabilityIncluded from [build-options] section
 *   (removes the entire section if it becomes empty)
 * - Preserve all other existing configuration
 * 
 * @param workspaceDir The workspace directory where Config.toml and Ballerina.toml should be updated
 * @returns Promise<void> Resolves when configuration is successfully written
 * @throws Error if file operations fail
 */
export async function removeTracingConfig(workspaceDir: string): Promise<void> {
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
    
    // Remove the tracing configuration sections (whichever provider was in use)
    let updatedContent = removeSection(existingContent, 'ballerinax.idetraceprovider');
    updatedContent = removeSection(updatedContent, 'ballerinax.amp');

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
 * Determines which tracing provider (if any) is currently active for a project, based on the
 * `import ballerinax/<provider> as _;` statement written to trace_enabled.bal when tracing was enabled.
 *
 * @param workspaceDir The project directory to check
 * @returns The active provider, or undefined if tracing is not enabled in this project
 */
export function getActiveTracingProvider(workspaceDir: string): TracingProvider | undefined {
    const traceFilePath = path.join(workspaceDir, 'trace_enabled.bal');
    if (!fs.existsSync(traceFilePath)) {
        return undefined;
    }
    try {
        const content = fs.readFileSync(traceFilePath, 'utf-8');
        return content.includes('ballerinax/amp') ? 'amp' : 'idetraceprovider';
    } catch (error) {
        console.error(`Failed to read ${traceFilePath}:`, error);
        return 'idetraceprovider';
    }
}

/**
 * Removes the [ballerinax.amp] section from Config.toml, if present. Used when switching the
 * tracing provider away from "amp" (e.g. to "idetraceprovider") while tracing stays enabled —
 * a case `removeTracingConfig` (which only runs when tracing is fully disabled) doesn't cover.
 *
 * @param workspaceDir The project directory whose Config.toml should be updated
 */
export function removeAmpConfig(workspaceDir: string): void {
    const configFilePath = path.join(workspaceDir, 'Config.toml');
    if (!fs.existsSync(configFilePath)) {
        return;
    }
    try {
        const existingContent = fs.readFileSync(configFilePath, 'utf-8');
        let updatedContent = removeSection(existingContent, 'ballerinax.amp');
        updatedContent = updatedContent.trimEnd();
        if (updatedContent.length > 0 && !updatedContent.endsWith('\n')) {
            updatedContent += '\n';
        }
        fs.writeFileSync(configFilePath, updatedContent, 'utf-8');
    } catch (error) {
        console.error('Failed to remove [ballerinax.amp] section from Config.toml:', error);
    }
}

/**
 * Checks whether the [ballerinax.amp] section in Config.toml is missing its required
 * otelEndpoint/apiKey values (either the section/keys are absent, or the values are blank).
 *
 * @param workspaceDir The project directory whose Config.toml should be checked
 * @returns true if otelEndpoint or apiKey still need to be filled in
 */
export function isAmpConfigIncomplete(workspaceDir: string): boolean {
    const configFilePath = path.join(workspaceDir, 'Config.toml');
    if (!fs.existsSync(configFilePath)) {
        return true;
    }
    try {
        const content = fs.readFileSync(configFilePath, 'utf-8');
        const parsedConfig: any = parse(content);
        const amp = parsedConfig?.ballerinax?.amp;
        return !amp?.otelEndpoint || !amp?.apiKey;
    } catch (error) {
        console.error('Failed to parse Config.toml while checking amp configuration:', error);
        return true;
    }
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
 * Removes specific keys from a TOML section
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
    
    // Remove keys from section
    const remainingLines = sectionLines.filter(line => {
        const trimmedLine = line.trim();
        // Keep the section header
        if (trimmedLine === sectionHeader) {
            return true;
        }
        // Check if this line contains a key we want to remove
        for (const key of keysToRemove) {
            // Match key = value (with or without quotes, with or without spaces)
            const keyPattern = new RegExp(`^\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=`);
            if (keyPattern.test(trimmedLine)) {
                return false; // Remove this line
            }
        }
        // Keep all other lines
        return true;
    });
    
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

