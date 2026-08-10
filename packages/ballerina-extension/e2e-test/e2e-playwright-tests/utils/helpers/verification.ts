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

import fs from 'fs';
import path from 'path';
import { newProjectPath } from './setup';

/**
 * Normalize source code for comparison
 */
function normalizeSource(source: string): string {
    return source
        .replace(/\r\n/g, '\n')           // Normalize line endings
        .replace(/\t/g, '    ')           // Convert tabs to spaces
        .split('\n')
        .map(line => line.trimEnd())      // Remove trailing whitespace
        .filter(line => line.trim() !== '') // Remove empty lines
        .join('\n')
        .trim();
}

/**
 * Compare a generated .bal file with an expected .bal file
 * @param generatedFileName - Name of the generated file (e.g., 'types.bal')
 * @param expectedFilePath - Path to the expected file (e.g., path to testOutput.bal)
 * @param substitutions - Optional map of literal substrings to replace in the
 *        expected content before comparison. Useful for tests that suffix
 *        identifiers with a per-attempt counter (e.g. `Role${attempt}`) but
 *        keep a single fixture file.
 */
export async function verifyGeneratedSource(
    generatedFileName: string,
    expectedFilePath: string,
    substitutions?: Record<string, string>
): Promise<void> {
    const { expect } = await import('@playwright/test');

    // Generated file is in the current test project folder
    const generatedFilePath = path.join(newProjectPath, generatedFileName);

    if (!fs.existsSync(generatedFilePath)) {
        throw new Error(`Generated file not found at: ${generatedFilePath}`);
    }

    if (!fs.existsSync(expectedFilePath)) {
        throw new Error(`Expected file not found at: ${expectedFilePath}`);
    }

    const actualContent = fs.readFileSync(generatedFilePath, 'utf-8');
    let expectedContent = fs.readFileSync(expectedFilePath, 'utf-8');
    if (substitutions) {
        for (const [from, to] of Object.entries(substitutions)) {
            expectedContent = expectedContent.split(from).join(to);
        }
    }

    const normalizedActual = normalizeSource(actualContent);
    const normalizedExpected = normalizeSource(expectedContent);

    expect(normalizedActual).toBe(normalizedExpected);
}

/**
 * Verify that a generated record type declares the given fields, scoped to
 * that type's block so matches elsewhere in the file don't cause false
 * positives.
 * @param generatedFileName - Name of the generated file (e.g., 'types.bal')
 * @param typeName - Name of the record type to look for (e.g., 'PersonJson1')
 * @param fieldNames - Field names expected to be declared within the record
 */
export async function verifyRecordFields(
    generatedFileName: string,
    typeName: string,
    fieldNames: string[]
): Promise<void> {
    const { expect } = await import('@playwright/test');

    const generatedFilePath = path.join(newProjectPath, generatedFileName);
    if (!fs.existsSync(generatedFilePath)) {
        throw new Error(`Generated file not found at: ${generatedFilePath}`);
    }

    const content = fs.readFileSync(generatedFilePath, 'utf-8');
    const recordMatch = content.match(
        new RegExp(`type\\s+${typeName}\\s+record\\s*{[|]?\\s*([\\s\\S]*?)\\};`)
    );
    expect(recordMatch, `Record type '${typeName}' not found in ${generatedFileName}`).toBeTruthy();

    const recordBody = recordMatch![1];
    for (const fieldName of fieldNames) {
        const fieldDeclared = new RegExp(`\\b${fieldName}\\s*;`).test(recordBody);
        expect(fieldDeclared, `Field '${fieldName}' not declared in record '${typeName}'`).toBe(true);
    }
}
