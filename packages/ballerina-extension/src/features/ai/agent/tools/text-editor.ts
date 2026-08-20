// Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com/) All Rights Reserved.

// WSO2 LLC. licenses this file to you under the Apache License,
// Version 2.0 (the "License"); you may not use this file except
// in compliance with the License.
// You may obtain a copy of the License at

// http://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied. See the License for the
// specific language governing permissions and limitations
// under the License.

import { ExecutionContext } from "@wso2/ballerina-core";
import { tool } from 'ai';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { CopilotEventHandler } from "../../utils/events";
import { normalizeInvisibleChars } from "../../utils/string-utils";
import { normalizeToLf, readAndNormalize, restoreEol } from "../../utils/eol-utils";
import { addToIntegration } from "../../../../rpc-managers/ai-panel/utils";
import { recordAiTouchedFile } from "../../../../rpc-managers/diagram-validity";
import { seedNewPackageBaseline } from "../../utils/project/ls-schema-notifications";

/**
 * Persists a tool's computed content directly into the real workspace file via VS Code's
 * document model (workspace.applyEdit + saveAll), so open editors and diagrams see it
 * immediately. No intermediate temp-directory write: tempProjectPath is the real project
 * root, so this is the only place a live edit is actually written.
 */
async function persistLiveEdit(
  file_path: string,
  content: string,
  modifiedFiles: string[] | undefined,
  allModifiedFiles: Set<string> | undefined,
  ctx: ExecutionContext | undefined
): Promise<void> {
  if (modifiedFiles) {
    insertIntoUpdateFileNames(modifiedFiles, file_path);
  }
  if (!ctx) {
    return;
  }
  const workspaceRoot = ctx.workspacePath || ctx.projectPath;
  const absolutePath = path.join(workspaceRoot, file_path);
  // A Ballerina.toml that doesn't exist yet means the agent is creating a whole new
  // package mid-run — its ai:// baseline must be frozen NOW, before more files land,
  // or the review diff loads the baseline from post-edit disk and shows no changes.
  const isNewPackageToml = path.basename(file_path) === 'Ballerina.toml' && !fs.existsSync(absolutePath);
  try {
    await addToIntegration(workspaceRoot, [{ filePath: file_path, content }]);
    recordAiTouchedFile(absolutePath);
    allModifiedFiles?.add(file_path);
    if (isNewPackageToml) {
      const packageRoot = path.dirname(absolutePath);
      // .bal files this generation already wrote into the new package: freeze them as
      // empty in the baseline so they still register as additions in the review.
      const alreadyWritten = new Set([...(modifiedFiles ?? []), ...(allModifiedFiles ?? [])]);
      const preexistingBalFiles = [...alreadyWritten]
        .filter(f => f.endsWith('.bal'))
        .map(f => path.resolve(workspaceRoot, f))
        .filter(abs => abs.startsWith(packageRoot + path.sep))
        .map(abs => path.relative(packageRoot, abs));
      await seedNewPackageBaseline(packageRoot, content, preexistingBalFiles);
    }
  } catch (error) {
    console.error("[TextEditorTool] Live persist failed:", error);
  }
}

// ============================================================================
// Display Helper Functions
// ============================================================================

/**
 * Emits tool_call event for file editing tools
 */
function emitFileToolCall(
    eventHandler: CopilotEventHandler,
    toolName: string,
    file_path: string
): void {
    eventHandler({
        type: "tool_call",
        toolName,
        toolInput: { fileName: file_path }
    });
}

/**
 * Emits tool_result event for file editing tools
 */
function emitFileToolResult(
    eventHandler: CopilotEventHandler,
    toolName: string,
    result: TextEditorResult,
    file_path?: string
): void {
    eventHandler({
        type: "tool_result",
        toolName,
        toolOutput: {
            success: result.success,
            action: result.action,
            fileName: file_path
        }
    });
}

// ============================================================================
// Types & Interfaces
// ============================================================================

interface ValidationResult {
  valid: boolean;
  error?: string;
}

interface TextEditorResult {
  success: boolean;
  message: string;
  action?: 'created' | 'updated';
  error?: string;
}

// ============================================================================
// Constants
// ============================================================================

const VALID_FILE_EXTENSIONS = [
    '.bal', '.toml', '.md', '.sql', ".yaml", ".yml", ".json", ".graphql", ".txt"
];

const RESTRICTED_READ_FILES = ['Config.toml'];

const MAX_LINE_LENGTH = 2000;
const PREVIEW_LENGTH = 200;

// ============================================================================
// Error Messages
// ============================================================================

const ErrorMessages = {
  FILE_NOT_FOUND: 'File not found',
  FILE_ALREADY_EXISTS: 'File already exists with content',
  INVALID_FILE_PATH: 'Invalid file path',
  INVALID_EXTENSION: 'Invalid file extension',
  EMPTY_CONTENT: 'Content cannot be empty',
  NO_MATCH_FOUND: 'No match found for old_string',
  MULTIPLE_MATCHES: 'Multiple matches found - old_string must be unique',
  IDENTICAL_STRINGS: 'old_string and new_string are identical',
  INVALID_LINE_RANGE: 'Invalid line range',
  EDIT_FAILED: 'Edit operation failed',
  NO_EDITS: 'No edits provided',
  FILE_READ_NOT_PERMITTED: 'File read not permitted',
};

// ============================================================================
// Validation Functions
// ============================================================================

function validateFilePath(filePath: string): ValidationResult {
  if (!filePath || typeof filePath !== 'string') {
    return {
      valid: false,
      error: 'File path is required and must be a string.'
    };
  }

  if (filePath.includes('..') || filePath.includes('~')) {
    return {
      valid: false,
      error: 'File path contains invalid characters (.., ~).'
    };
  }

  const hasValidExtension = VALID_FILE_EXTENSIONS.some(ext => 
    filePath.endsWith(ext)
  );

  if (!hasValidExtension) {
    return {
      valid: false,
      error: `File must have a valid extension: ${VALID_FILE_EXTENSIONS.join(', ')}`
    };
  }

  return { valid: true };
}

function validateLineRange(
  offset: number,
  limit: number,
  totalLines: number
): ValidationResult {
  if (offset < 1 || offset > totalLines) {
    return {
      valid: false,
      error: `Invalid offset ${offset}. File has ${totalLines} lines.`
    };
  }

  if (limit < 1) {
    return {
      valid: false,
      error: `Invalid limit ${limit}. Must be at least 1.`
    };
  }

  return { valid: true };
}

// ============================================================================
// Utility Functions
// ============================================================================

function countOccurrences(text: string, searchString: string): number {
  if (searchString.trim().length === 0 && text.trim().length === 0) {
        return 1;
  }

  if (!searchString) { return 0; }
  
  let count = 0;
  let position = 0;

  while ((position = text.indexOf(searchString, position)) !== -1) {
    count++;
    position += searchString.length;
  }

  return count;
}

function truncateLongLines(content: string, maxLength: number = MAX_LINE_LENGTH): string {
  const lines = content.split('\n');
  return lines.map(line => {
    if (line.length > maxLength) {
      return line.substring(0, maxLength) + '... [truncated]';
    }
    return line;
  }).join('\n');
}

// ============================================================================
// Write Tool Execute Function
// ============================================================================

export function createWriteExecute(
  eventHandler: CopilotEventHandler,
  tempProjectPath: string,
  modifiedFiles?: string[],
  allModifiedFiles?: Set<string>,
  ctx?: ExecutionContext
) {
  return async (args: {
    file_path: string;
    content: string;
  }): Promise<TextEditorResult> => {
    const { file_path, content } = args;

    // Emit tool_call event
    emitFileToolCall(eventHandler, FILE_WRITE_TOOL_NAME, file_path);

    console.log(`[FileWriteTool] Writing to ${file_path}, content: ${content.substring(0, 50)}${content.length > 100 ? '... [truncated]' : ''}`);

    // Validate file path
    const pathValidation = validateFilePath(file_path);
    if (!pathValidation.valid) {
      console.error(`[FileWriteTool] Invalid file path: ${file_path}`);
      const result = {
        success: false,
        message: pathValidation.error!,
        error: `Error: ${ErrorMessages.INVALID_FILE_PATH}`
      };
      emitFileToolResult(eventHandler, FILE_WRITE_TOOL_NAME, result, file_path);
      return result;
    }

    // Validate content is not empty
    if (!content || content.trim().length === 0) {
      console.error(`[FileWriteTool] Empty content provided for file: ${file_path}`);
      const result = {
        success: false,
        message: 'Content cannot be empty when writing a file. if you wish to create an empty file, add a comment with the file name.',
        error: `Error: ${ErrorMessages.EMPTY_CONTENT}`
      };
      emitFileToolResult(eventHandler, FILE_WRITE_TOOL_NAME, result, file_path);
      return result;
    }

    const fullPath = path.join(tempProjectPath, file_path);

    // Check if file exists (track for message generation)
    const fileExists = fs.existsSync(fullPath);

    // Check if file exists with non-empty content
    if (fileExists) {
      const existingContent = fs.readFileSync(fullPath, 'utf-8');
      if (existingContent.trim().length > 0) {
        console.error(`[FileWriteTool] File already exists with content: ${file_path}`);
        const result = {
          success: false,
          message: `File '${file_path}' already exists with content. Use ${FILE_SINGLE_EDIT_TOOL_NAME} or ${FILE_BATCH_EDIT_TOOL_NAME} to modify it instead.`,
          error: `Error: ${ErrorMessages.FILE_ALREADY_EXISTS}`
        };
        emitFileToolResult(eventHandler, FILE_WRITE_TOOL_NAME, result, file_path);
        return result;
      }
    }

    const lineCount = content.split('\n').length;
    const action: 'created' | 'updated' = fileExists ? 'updated' : 'created';

    // Neither case notifies the ai:// baseline: a brand-new file has to stay absent from it
    // to read as an addition, and an existing one is already frozen there from generation
    // start. See the notes in utils/project/ls-schema-notifications.ts.
    await persistLiveEdit(file_path, content, modifiedFiles, allModifiedFiles, ctx);

    console.log(`[FileWriteTool] Successfully ${action} file: ${file_path} with ${lineCount} lines.`);
    const result = {
      success: true,
      message: `Successfully ${action} file '${file_path}' with ${lineCount} line(s).`,
      action
    };

    // Emit tool_result event
    emitFileToolResult(eventHandler, FILE_WRITE_TOOL_NAME, result, file_path);

    return result;
  };
}

// ============================================================================
// Edit Tool Execute Function
// ============================================================================

export function createEditExecute(
  eventHandler: CopilotEventHandler,
  tempProjectPath: string,
  modifiedFiles?: string[],
  allModifiedFiles?: Set<string>,
  ctx?: ExecutionContext
) {
  return async (args: {
    file_path: string;
    old_string: string;
    new_string: string;
    replace_all?: boolean;
  }): Promise<TextEditorResult> => {
    const { file_path, old_string, new_string, replace_all = false } = args;

    // Emit tool_call event
    emitFileToolCall(eventHandler, FILE_SINGLE_EDIT_TOOL_NAME, file_path);

    console.log(`[FileEditTool] Editing ${file_path}, replacing '${old_string.substring(0, 50)}' with '${new_string.substring(0,50)}', replace_all: ${replace_all}`);

    // Validate file path
    const pathValidation = validateFilePath(file_path);
    if (!pathValidation.valid) {
      console.error(`[FileEditTool] Invalid file path: ${file_path}`);
      const result = {
        success: false,
        message: pathValidation.error!,
        error: `Error: ${ErrorMessages.INVALID_FILE_PATH}`
      };
      emitFileToolResult(eventHandler, FILE_SINGLE_EDIT_TOOL_NAME, result, file_path);
      return result;
    }

    // Pre-normalize strings to check if they're identical (handles invisible char differences)
    const preNormalizedOld = normalizeInvisibleChars(old_string);
    const preNormalizedNew = normalizeInvisibleChars(new_string);

    // Check if old_string and new_string are identical after normalization
    if (preNormalizedOld === preNormalizedNew) {
      console.error(`[FileEditTool] old_string and new_string are identical for file: ${file_path}`);
      const result = {
        success: false,
        message: 'old_string and new_string are identical. No changes to make.',
        error: `Error: ${ErrorMessages.IDENTICAL_STRINGS}`
      };
      emitFileToolResult(eventHandler, FILE_SINGLE_EDIT_TOOL_NAME, result, file_path);
      return result;
    }

    const fullPath = path.join(tempProjectPath, file_path);

    // Check if file exists
    if (!fs.existsSync(fullPath)) {
      console.error(`[FileEditTool] File not found: ${file_path}`);
      const result = {
        success: false,
        message: `File '${file_path}' not found. Use ${FILE_WRITE_TOOL_NAME} to create new files.`,
        error: `Error: ${ErrorMessages.FILE_NOT_FOUND}`
      };
      emitFileToolResult(eventHandler, FILE_SINGLE_EDIT_TOOL_NAME, result, file_path);
      return result;
    }

    // Read file content and normalize line endings (CRLF → LF)
    const rawContent = fs.readFileSync(fullPath, 'utf-8');
    const [content, originalEol] = readAndNormalize(rawContent);

    // Try exact match first (99% case - no normalization needed)
    const exactOccurrenceCount = countOccurrences(content, old_string);

    // Determine if we need to use normalized matching (fallback for invisible char issues)
    const useNormalizedMatching = exactOccurrenceCount === 0;
    let workingContent = content;
    let workingOldString = old_string;
    let workingNewString = new_string;

    if (useNormalizedMatching) {
      // Fallback: normalize both content and strings to handle invisible char mismatches
      workingContent = normalizeInvisibleChars(content);
      workingOldString = preNormalizedOld;
      workingNewString = preNormalizedNew;
      console.log(`[FileEditTool] Exact match failed, trying normalized matching for: ${file_path}`);
    }

    // Count occurrences (using exact or normalized based on fallback)
    const occurrenceCount = useNormalizedMatching
      ? countOccurrences(workingContent, workingOldString)
      : exactOccurrenceCount;

    if (occurrenceCount === 0) {
      const preview = content.substring(0, PREVIEW_LENGTH);
      console.error(`[FileEditTool] No occurrences of old_string found in file: ${file_path}`);
      const result = {
        success: false,
        message: `String to replace was not found in '${file_path}'. Please verify the exact text to replace, including whitespace and indentation. \n File Preview: \n${preview + (content.length > PREVIEW_LENGTH ? '...' : '')}`,
        error: `Error: ${ErrorMessages.NO_MATCH_FOUND}`,
      };
      emitFileToolResult(eventHandler, FILE_SINGLE_EDIT_TOOL_NAME, result, file_path);
      return result;
    }

    // If not replace_all, ensure exactly one match
    if (!replace_all && occurrenceCount > 1) {
      console.error(`[FileEditTool] Multiple occurrences (${occurrenceCount}) found for old_string in file: ${file_path}`);
      const result = {
        success: false,
        message: `Found ${occurrenceCount} occurrences of the text in '${file_path}'. Either make old_string more specific to match exactly one occurrence, or set replace_all to true to replace all occurrences.`,
        error: `Error: ${ErrorMessages.MULTIPLE_MATCHES}`,
      };
      emitFileToolResult(eventHandler, FILE_SINGLE_EDIT_TOOL_NAME, result, file_path);
      return result;
    }

    // Perform replacement
    let newContent: string;
    if (workingContent.trim() === "" && workingOldString.trim() === "") {
        newContent = workingNewString;
    } else {
      if (replace_all) {
        newContent = workingContent.replaceAll(workingOldString, workingNewString);
      } else {
        newContent = workingContent.replace(workingOldString, workingNewString);
      }
    }

    await persistLiveEdit(file_path, restoreEol(newContent, originalEol), modifiedFiles, allModifiedFiles, ctx);

    const replacedCount = replace_all ? occurrenceCount : 1;
    console.log(`[FileEditTool] Successfully replaced ${replacedCount} occurrence(s) in file: ${file_path}`);
    const result = {
      success: true,
      message: `Successfully replaced ${replacedCount} occurrence(s) in '${file_path}'.`
    };

    // Emit tool_result event
    emitFileToolResult(eventHandler, FILE_SINGLE_EDIT_TOOL_NAME, result, file_path);

    return result;
  };
}

// ============================================================================
// Multi Edit Tool Execute Function
// ============================================================================

export function createMultiEditExecute(
  eventHandler: CopilotEventHandler,
  tempProjectPath: string,
  modifiedFiles?: string[],
  allModifiedFiles?: Set<string>,
  ctx?: ExecutionContext
) {
  return async (args: {
    file_path: string;
    edits: Array<{
      old_string: string;
      new_string: string;
      replace_all?: boolean;
    }>;
  }): Promise<TextEditorResult> => {
    const { file_path, edits } = args;

    // Emit tool_call event
    emitFileToolCall(eventHandler, FILE_BATCH_EDIT_TOOL_NAME, file_path);

    console.log(`[FileMultiEditTool] Editing ${file_path} with ${edits.length} edits.`);

    // Validate file path
    const pathValidation = validateFilePath(file_path);
    if (!pathValidation.valid) {
      console.error(`[FileMultiEditTool] Invalid file path: ${file_path}`);
      const result = {
        success: false,
        message: pathValidation.error!,
        error: `Error: ${ErrorMessages.INVALID_FILE_PATH}`
      };
      emitFileToolResult(eventHandler, FILE_BATCH_EDIT_TOOL_NAME, result, file_path);
      return result;
    }

    // Validate edits array
    if (!edits || edits.length === 0) {
      console.error(`[FileMultiEditTool] No edits provided for file: ${file_path}`);
      const result = {
        success: false,
        message: 'No edits provided. At least one edit is required.',
        error: `Error: ${ErrorMessages.NO_EDITS}`
      };
      emitFileToolResult(eventHandler, FILE_BATCH_EDIT_TOOL_NAME, result, file_path);
      return result;
    }

    const fullPath = path.join(tempProjectPath, file_path);

    // Check if file exists
    if (!fs.existsSync(fullPath)) {
      console.error(`[FileMultiEditTool] File not found: ${file_path}`);
      const result = {
        success: false,
        message: `File '${file_path}' not found. Use ${FILE_WRITE_TOOL_NAME} to create new files.`,
        error: `Error: ${ErrorMessages.FILE_NOT_FOUND}`
      };
      emitFileToolResult(eventHandler, FILE_BATCH_EDIT_TOOL_NAME, result, file_path);
      return result;
    }

    // Read file content and normalize line endings (CRLF → LF)
    const rawContent = fs.readFileSync(fullPath, 'utf-8');
    const [originalContent, originalEol] = readAndNormalize(rawContent);

    // First pass: check if all edits work with exact matching (99% case)
    let useNormalizedMatching = false;
    let testContent = originalContent;

    for (const edit of edits) {
      const exactCount = countOccurrences(testContent, edit.old_string);
      if (exactCount === 0) {
        // Exact match failed, we'll need normalized matching
        useNormalizedMatching = true;
        break;
      }
      // Simulate the edit for subsequent checks
      if (edit.replace_all) {
        testContent = testContent.replaceAll(edit.old_string, edit.new_string);
      } else {
        testContent = testContent.replace(edit.old_string, edit.new_string);
      }
    }

    if (useNormalizedMatching) {
      console.log(`[FileMultiEditTool] Exact match failed for some edits, using normalized matching for: ${file_path}`);
    }

    // Use either original or normalized content based on the check above
    let content = useNormalizedMatching ? normalizeInvisibleChars(originalContent) : originalContent;

    // Validate all edits before applying any
    const validationErrors: string[] = [];

    for (let i = 0; i < edits.length; i++) {
      const edit = edits[i];

      // Use normalized strings only if we're in normalized mode
      const workingOldString = useNormalizedMatching ? normalizeInvisibleChars(edit.old_string) : edit.old_string;
      const workingNewString = useNormalizedMatching ? normalizeInvisibleChars(edit.new_string) : edit.new_string;

      // Check if old_string and new_string are identical
      if (workingOldString === workingNewString) {
        validationErrors.push(`Edit ${i + 1}: old_string and new_string are identical`);
        continue;
      }

      // Count occurrences in current content state
      const occurrenceCount = countOccurrences(content, workingOldString);

      if (occurrenceCount === 0) {
        validationErrors.push(`Edit ${i + 1}: old_string not found in file`);
        continue;
      }

      if (!edit.replace_all && occurrenceCount > 1) {
        validationErrors.push(`Edit ${i + 1}: Found ${occurrenceCount} occurrences. Set replace_all to true or make old_string more specific`);
        continue;
      }

      // Apply the edit to simulate the sequence
      if (content.trim() === "" && workingOldString.trim() === "") {
        content = workingNewString;
      } else {
        if (edit.replace_all) {
          content = content.replaceAll(workingOldString, workingNewString);
        } else {
          content = content.replace(workingOldString, workingNewString);
        }
      }
    }

    // If there were validation errors, return them without applying any edits
    if (validationErrors.length > 0) {
      console.error(`[FileMultiEditTool] Validation errors:\n${validationErrors.join('\n')}`);
      const result = {
        success: false,
        message: `Multi-edit validation failed:\n${validationErrors.join('\n')}`,
        error: `Error: ${ErrorMessages.EDIT_FAILED}`,
      };
      emitFileToolResult(eventHandler, FILE_BATCH_EDIT_TOOL_NAME, result, file_path);
      return result;
    }

    // All validations passed, content already has all edits applied
    await persistLiveEdit(file_path, restoreEol(content, originalEol), modifiedFiles, allModifiedFiles, ctx);

    console.log(`[FileMultiEditTool] Successfully applied ${edits.length} edits to file: ${file_path}`);
    const result = {
      success: true,
      message: `Successfully applied ${edits.length} edit(s) to '${file_path}'.`
    };

    // Emit tool_result event
    emitFileToolResult(eventHandler, FILE_BATCH_EDIT_TOOL_NAME, result, file_path);

    return result;
  };
}

// ============================================================================
// Read Tool Execute Function
// ============================================================================

export function createReadExecute(
  eventHandler: CopilotEventHandler,
  tempProjectPath: string
) {
  return async (args: {
    file_path: string;
    offset?: number;
    limit?: number;
  }): Promise<TextEditorResult> => {
    const { file_path, offset, limit } = args;

    // Validate file path
    const pathValidation = validateFilePath(file_path);
    if (!pathValidation.valid) {
      console.error(`[FileReadTool] Invalid file path: ${file_path}`);
      return {
        success: false,
        message: pathValidation.error!,
        error: `Error: ${ErrorMessages.INVALID_FILE_PATH}`
      };
    }

    // Block reads of restricted files (e.g. Config.toml) in any path
    const fileName = (file_path.replace(/\\/g, '/').split('/').pop() ?? '').toLowerCase();
    if (RESTRICTED_READ_FILES.some(f => f.toLowerCase() === fileName)) {
      console.error(`[FileReadTool] Blocked read of restricted file: ${file_path}`);
      return {
        success: false,
        message: `Reading '${file_path}' is not permitted.`,
        error: `Error: ${ErrorMessages.FILE_READ_NOT_PERMITTED}`
      };
    }

    const fullPath = path.join(tempProjectPath, file_path);

    // Check if file exists
    if (!fs.existsSync(fullPath)) {
      console.error(`[FileReadTool] File not found: ${file_path}`);
      return {
        success: false,
        message: `File '${file_path}' not found.`,
        error: `Error: ${ErrorMessages.FILE_NOT_FOUND}`
      };
    }

    // Emit tool_call event now that we know the file exists
    emitFileToolCall(eventHandler, FILE_READ_TOOL_NAME, file_path);

    // Read file content and normalize line endings (CRLF → LF)
    const content = normalizeToLf(fs.readFileSync(fullPath, 'utf-8'));

    // Handle empty file
    if (content.trim().length === 0) {
      console.log(`[FileReadTool] File is empty: ${file_path}`);
      const result = { success: true, message: `File '${file_path}' is empty.` };
      emitFileToolResult(eventHandler, FILE_READ_TOOL_NAME, result, file_path);
      return result;
    }

    // Split content into lines
    const lines = content.split('\n');
    const totalLines = lines.length;

    // Handle ranged read
    if (offset !== undefined && limit !== undefined) {
      const validation = validateLineRange(offset, limit, totalLines);
      if (!validation.valid) {
        console.error(`[FileReadTool] Invalid line range for file: ${file_path}, offset: ${offset}, limit: ${limit}`);
        const result = {
          success: false,
          message: validation.error!,
          error: `Error: ${ErrorMessages.INVALID_LINE_RANGE}`
        };
        emitFileToolResult(eventHandler, FILE_READ_TOOL_NAME, result, file_path);
        return result;
      }

      const startIndex = offset - 1; // Convert to 0-based index
      const endIndex = Math.min(startIndex + limit, totalLines);
      const rangedLines = lines.slice(startIndex, endIndex);
      const rangedContent = truncateLongLines(rangedLines.join('\n'));

      console.log(`[FileReadTool] Read lines ${offset} to ${endIndex} from file: ${file_path}`);
      const result = {
        success: true,
        message: `Read lines ${offset} to ${endIndex} from '${file_path}' (${endIndex - startIndex} lines). \nContent:${rangedContent}`,
      };
      emitFileToolResult(eventHandler, FILE_READ_TOOL_NAME, result, file_path);
      return result;
    }

    // Return full content
    const truncatedContent = truncateLongLines(content);

    console.log(`[FileReadTool] Read entire file: ${file_path}, total lines: ${totalLines}`);
    const result = {
      success: true,
      message: `Read entire file '${file_path}' (${totalLines} lines).\nContent:${truncatedContent}`,
    };
    emitFileToolResult(eventHandler, FILE_READ_TOOL_NAME, result, file_path);
    return result;
  };
}

// ============================================================================

export const FILE_BATCH_EDIT_TOOL_NAME = "file_batch_edit";
export const FILE_SINGLE_EDIT_TOOL_NAME = "file_edit";
export const FILE_WRITE_TOOL_NAME = "file_write";
export const FILE_READ_TOOL_NAME = "file_read";

const getFilePathDescription = (op: string) => `The relative path to the file to ${op}. For workspace projects, include the package directory prefix (e.g., "myPackage/main.bal"). For single-package projects, use just the filename.`;

// Type definitions for execute functions
type WriteExecute = (args: {
  file_path: string;
  content: string;
}) => Promise<any>;

type EditExecute = (args: {
  file_path: string;
  old_string: string;
  new_string: string;
  replace_all?: boolean;
}) => Promise<any>;

type MultiEditExecute = (args: {
  file_path: string;
  edits: Array<{
    old_string: string;
    new_string: string;
    replace_all?: boolean;
  }>;
}) => Promise<any>;

type ReadExecute = (args: {
  file_path: string;
  offset?: number;
  limit?: number;
}) => Promise<any>;

// 1. Write Tool
export function createWriteTool(execute: WriteExecute) {
  return tool({
    description: `Writes a file to the local filesystem.
    Usage:
    - This tool will return an error if there is a file with non-empty content at the provided path.
    - ALWAYS prefer editing existing files in the codebase. NEVER write new files unless explicitly required.
    - If this is an existing file, Use ${FILE_BATCH_EDIT_TOOL_NAME} or ${FILE_SINGLE_EDIT_TOOL_NAME} to modify it instead.
    - NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.
    - Only use emojis if the user explicitly requests it. Avoid writing emojis to files unless asked.`,
    inputSchema: z.object({
      file_path: z.string().describe(getFilePathDescription("write")),
      content: z.string().describe("The content to write to the file, This cannot be empty")
    }),
    execute
  });
}

// The line number prefix format is: spaces + line number + tab. Everything after that tab is the actual file content to match. Never include any part of the line number prefix in the old_string or new_string.
// ensure you preserve the exact indentation (tabs/spaces) as it appears AFTER the line number prefix.

// 2. Edit Tool
export function createEditTool(execute: EditExecute) {
  return tool({
    description: `Performs exact string replacements in files. 
    Usage:
    - You must read the chat history at least once before editing, as the user’s message contains the content of the each source file. This tool will error if you attempt an edit without reading the chat history. 
    - When editing text content of a file that you obtained from the chat history you read earlier, ensure you preserve the exact indentation (tabs/spaces) as it appears AFTER the line number prefix.
    - If there are multiple edits to be made to the same file, prefer using the ${FILE_BATCH_EDIT_TOOL_NAME} tool instead of this one.
    - Do not create new files using this tool. Only edit existing files. If the file does not exist, Use ${FILE_WRITE_TOOL_NAME} to create new files.
    - NEVER proactively edit documentation files (*.md) or README files. Only edit documentation files if explicitly requested by the User.
    - Only use emojis if the user explicitly requests it. Avoid adding emojis to files unless asked.
    - The edit will FAIL if **old_string** is not unique in the file. Either provide a larger string with more surrounding context to make it unique or use **replace_all** to change every instance of **old_string**. 
    - Use **replace_all** for replacing and renaming strings across the file. This parameter is useful if you want to rename a variable for instance.`,
    inputSchema: z.object({
      file_path: z.string().describe(getFilePathDescription("edit")),
      old_string: z.string().describe("The text to replace (must match the file contents exactly, including all whitespace and indentation)"),
      new_string: z.string().describe("The text to replace it with (must be different from old_string)"),
      replace_all: z.boolean().default(false).describe("Replace all occurences of old_string (default false), if true will replace all occurences of old_string, otherwise will only replace if there is exactly one match.")
    }),
    execute
  });
}

// 3. Multi Edit Tool
export function createBatchEditTool(execute: MultiEditExecute) {
  return tool({
    description: `This is a tool for making multiple edits to a single file in one operation. It is built on top of the ${FILE_SINGLE_EDIT_TOOL_NAME} tool and allows you to perform multiple find-and-replace operations efficiently. Prefer this tool over the ${FILE_SINGLE_EDIT_TOOL_NAME} tool when you need to make multiple edits to the same file.
    Before using this tool:
    1. You must read the chat history at least once before editing, as the user’s message contains the content of the each source file and the context.
    2. Verify the file path is correct
    3. Do not create new files using this tool. Only edit existing files. If the file does not exist, Use ${FILE_WRITE_TOOL_NAME} to create new files.
    To make multiple file edits, provide the following:
    1. file_path: The relative path to the file. For workspace projects, include the package directory prefix (e.g., "myPackage/main.bal").
    2. edits: An array of edit operations to perform, where each edit contains:
       - old_string: The text to replace (must match the file contents exactly, including all whitespace and indentation)
       - new_string: The edited text to replace the old_string
       - replace_all: Replace all occurences of old_string. This parameter is optional and defaults to false. if true will replace all occurences of old_string, otherwise will only replace if there is exactly one match.
    IMPORTANT:
    - All edits are applied in sequence, in the order they are provided
    - Each edit operates on the result of the previous edit
    - All edits must be valid for the operation to succeed - if any edit fails, none will be applied
    - This tool is ideal when you need to make several changes to different parts of the same file
    - NEVER proactively edit documentation files (*.md) or README files. Only edit documentation files if explicitly requested by the User.
    CRITICAL REQUIREMENTS:
    1. All edits follow the same requirements as the ${FILE_SINGLE_EDIT_TOOL_NAME} tool
    2. The edits are atomic - either all succeed or none are applied
    3. Plan your edits carefully to avoid conflicts between sequential operations
    WARNING:
    - The tool will fail if edits.old_string doesn't match the file contents exactly (including whitespace)
    - The tool will fail if edits.old_string and edits.new_string are the same
    - Since edits are applied in sequence, ensure that earlier edits don't affect the text that later edits are trying to find
    When making edits:
    - Ensure all edits result in idiomatic, correct code
    - Do not leave the code in a broken state
    - For workspace projects, include the package directory prefix in the file path.
    - Only use emojis if the user explicitly requests it. Avoid adding emojis to files unless asked.
    - Use replace_all for replacing and renaming strings across the file. This parameter is useful if you want to rename a variable for instance.`,
    inputSchema: z.object({
      file_path: z.string().describe(getFilePathDescription("edit")),
      edits: z.array(
        z.object({
          old_string: z.string().describe("The text to replace (must match the file contents exactly, including all whitespace and indentation)"),
          new_string: z.string().describe("The text to replace it with (must be different from old_string)"),
          replace_all: z.boolean().default(false).describe("Replace all occurences of old_string (default false), if true will replace all occurences of old_string, otherwise will only replace if there is exactly one match.")
        })
      ).min(1).describe("Array of edit operations to perform sequentially on the file")
    }),
    execute
  });
}

// 4. Read Tool
export function createReadTool(execute: ReadExecute) {
  return tool({
    description: `Reads a file from the local filesystem.
    ALWAYS prefer reading files mentioned in the user’s message in the chat history first. Only use this tool if you need to read a file that is not present in the chat history.
    NOTE: The following files are restricted and cannot be read: ${RESTRICTED_READ_FILES.join(", ")}.
    Usage:
    - For workspace projects, include the package directory prefix in the file path (e.g., "myPackage/main.bal").
    - You can optionally specify a line offset and limit (especially handy for long files).
    - Any lines longer than 2000 characters will be truncated
    - The file content will be returned as string
    - If the file is very large, consider using the offset and limit parameters to read it in chunks.`,
    inputSchema: z.object({
      file_path: z.string().describe(getFilePathDescription("read")),
      offset: z.number().optional().describe("The line number to start reading from. Only provide if the file is too large to read at once"),
      limit: z.number().optional().describe("The number of lines to read. Only provide if the file is too large to read at once.")
    }),
    execute
  });
}
function insertIntoUpdateFileNames(updatedFileNames: string[], file_path: string) {
    if (!updatedFileNames.includes(file_path)) {
      updatedFileNames.push(file_path);
    }
}
