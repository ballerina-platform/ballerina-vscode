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

import {
  Attachment,
  ComponentInfo,
  DataMappingRecord,
  GenerateTypesFromRecordRequest,
  GenerateTypesFromRecordResponse,
  ModuleSummary,
  PackageSummary,
  ProjectComponentsResponse,
} from "@wso2/ballerina-core";
import path from "path";
import { extractRecordTypeDefinitionsFromFile } from "../../../../rpc-managers/ai-panel/utils";
import { TypesGenerationResult } from "../types";
import { existsSync, readFileSync } from "fs";

/**
 * Type extraction and generation from context
 */

// Generate Ballerina record types from context attachments and validate against existing records
// TODO: Refactor this. We need to generate types, get diagnostics, and validate in a better way.
export async function generateTypesFromContext(
  sourceAttachments: Attachment[],
  projectComponents: ProjectComponentsResponse,
  tempDirectory: string
): Promise<TypesGenerationResult> {
  if (!sourceAttachments || sourceAttachments.length === 0) {
    throw new Error("Source attachments are required for type generation");
  }

  if (!projectComponents) {
    throw new Error("Project components are required for type generation");
  }

  const outputFileName = "types.bal";
  const existingRecordTypesMap = new Map<string, DataMappingRecord>();

  projectComponents.components.packages?.forEach((packageSummary: PackageSummary) => {
    packageSummary.modules?.forEach((moduleSummary: ModuleSummary) => {
      let baseFilePath = packageSummary.filePath;
      if (moduleSummary.name !== undefined) {
        baseFilePath += `modules/${moduleSummary.name}/`;
      }
      moduleSummary.records.forEach((recordComponent: ComponentInfo) => {
        const recordFilePath = baseFilePath + recordComponent.filePath;
        existingRecordTypesMap.set(recordComponent.name, { type: recordComponent.name, isArray: false, filePath: recordFilePath });
      });
      moduleSummary.types.forEach((typeComponent: ComponentInfo) => {
        const typeFilePath = baseFilePath + typeComponent.filePath;
        existingRecordTypesMap.set(typeComponent.name, { type: typeComponent.name, isArray: false, filePath: typeFilePath });
      });
      moduleSummary.enums.forEach((enumComponent: ComponentInfo) => {
        const enumFilePath = baseFilePath + enumComponent.filePath;
        existingRecordTypesMap.set(enumComponent.name, { type: enumComponent.name, isArray: false, filePath: enumFilePath });
      });
    });
  });

  // Generate type definitions from all attachments together
  const typeGenerationRequest: GenerateTypesFromRecordRequest = {
    attachment: sourceAttachments
  };

  const typeGenerationResponse = await generateTypeCreation(typeGenerationRequest);
  const generatedTypesCode = typeGenerationResponse.typesCode;

  // Caller persists finalTypesCode; this only reads any existing types.bal to append to.
  const typesFilePath = path.join(tempDirectory, outputFileName);

  let finalTypesCode = generatedTypesCode;
  if (existsSync(typesFilePath)) {
    const existingContent = readFileSync(typesFilePath, 'utf-8');
    finalTypesCode = existingContent.trim() + '\n\n' + generatedTypesCode.trim();
  }

  return {
    typesCode: finalTypesCode,
    filePath: outputFileName,
    recordMap: existingRecordTypesMap
  };
}

// Generate Ballerina record type definitions from attachment files
export async function generateTypeCreation(
  typeGenerationRequest: GenerateTypesFromRecordRequest
): Promise<GenerateTypesFromRecordResponse> {
  if (typeGenerationRequest.attachment.length === 0) {
    throw new Error('No attachments provided for type generation');
  }

  // Process all attachments together to understand correlations
  const generatedTypeDefinitions = await extractRecordTypeDefinitionsFromFile(typeGenerationRequest.attachment);
  if (typeof generatedTypeDefinitions !== 'string') {
    throw new Error(`Failed to generate types: ${JSON.stringify(generatedTypeDefinitions)}`);
  }

  return { typesCode: generatedTypeDefinitions };
}
