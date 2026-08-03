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

import * as fs from 'fs';
import * as path from 'path';
import { Uri } from 'vscode';
import { StateMachine } from "../../../../stateMachine";
import { ProjectSource, PROJECT_KIND } from "@wso2/ballerina-core";

/**
 * How the ai:// baseline works, and the Language Server behaviours every caller here depends
 * on. All of them follow from the LS holding one project instance per (scheme, root):
 *
 * 1. That instance takes its sources from disk when it is *created*, and a baseline the LS
 *    already has is never re-read. The temp-copy model hid this by copying the project to a
 *    fresh directory per run; direct editing reuses the real root for every generation, so
 *    the previous baseline has to be dropped explicitly — otherwise turn two diffs against
 *    turn one's pre-edit sources and everything an earlier turn wrote comes back as an
 *    addition. Hence: evict, then state the content.
 * 2. Eviction is a didClose on an ai:// document (the ai:// workspace drops the whole project,
 *    unlike the file:// one). Whichever notification arrives next — open or change — misses
 *    the cache and rebuilds the package from disk, so either can re-establish the baseline.
 * 3. Opening a document rebuilds the package from disk *even when the project is cached*, and
 *    only then applies that document's text; a change updates a document in place. So opening
 *    files one by one leaves just the last one holding its intended content — anything setting
 *    more than one file's baseline has to send the content as changes.
 *
 * A corollary the file-creating tools rely on: a file with no ai:// document at all is
 * exactly how getSemanticDiff recognises an addition, so brand-new files are deliberately
 * left unseeded — announcing them would trigger (2) and wipe every other file's original.
 *
 * TODO: this all works around behaviour the LS never states. A dedicated LS request to reset
 * a project's ai:// baseline would remove the need to route around it from out here.
 */

/** The ai:// address of a file — the same path the extension sees, under the baseline scheme. */
function toAiUri(fullPath: string): string {
  return Uri.file(fullPath).with({ scheme: 'ai' }).toString();
}

/**
 * Drops the ai:// package the Language Server is holding for this file's project, so that
 * the next ai:// notification for it rebuilds the package from what is on disk right now.
 * @param fullPath The absolute path of a file in the package whose baseline is dropped
 */
function evictAiBaseline(fullPath: string): void {
  try {
    StateMachine.langClient().didClose({ textDocument: { uri: toAiUri(fullPath) } });
  } catch (error) {
    console.error(`[AgentNotification] Failed to evict ai:// baseline for ${fullPath}:`, error);
  }
}

/**
 * Seeds the ai:// frozen-baseline scheme with a pristine (pre-edit) file's current content.
 * Called once per package at generation start (via each package's Ballerina.toml), before
 * any edits. file:// needs no equivalent call: tempProjectPath is now the real workspace
 * path, and file:// is the extension's own always-live LS scheme for it — already loaded
 * from normal extension operation (diagrams etc.), and kept in sync automatically by VS
 * Code's language client for any real workspace.applyEdit going forward.
 * @param tempProjectPath The root path of the project (the real workspace/project root)
 * @param filePath The relative file path
 */
function seedAiBaseline(tempProjectPath: string, filePath: string): void {
  try {
    const fileFullPath = path.join(tempProjectPath, filePath);
    if (!fs.existsSync(fileFullPath)) {
      console.warn(`[AgentNotification] File does not exist, skipping ai:// seed: ${fileFullPath}`);
      return;
    }

    const fileContent = fs.readFileSync(fileFullPath, 'utf-8');
    const languageId = filePath.endsWith('.bal') ? 'ballerina' : 'toml';

    try {
      // Discard the previous generation's baseline first; the didOpen below then reloads
      // the package from disk as it stands right now, before this generation's first edit.
      evictAiBaseline(fileFullPath);
      StateMachine.langClient().didOpen({
        textDocument: {
          uri: toAiUri(fileFullPath),
          languageId,
          version: 1,
          text: fileContent
        }
      });
      console.log(`[AgentNotification] Seeded ai:// baseline for: ${filePath}`);
    } catch (error) {
      console.error(`[AgentNotification] Failed to seed ai:// baseline for ${filePath}:`, error);
    }
  } catch (error) {
    console.error(`[AgentNotification] Failed to seed ai:// baseline for ${filePath}:`, error);
  }
}

/**
 * Seeds the ai:// baseline for every package in the project at generation start, via each
 * package's Ballerina.toml (one seedAiBaseline call per package is enough: dropping and
 * re-opening any of a package's documents makes the LS re-scan the whole package from disk
 * and cache it under ai://).
 * @param tempProjectPath The root path of the project (the real workspace/project root)
 * @param projects Array of project sources containing source files, modules, and tests
 */
export function sendAgentDidOpenForFreshProjects(tempProjectPath: string, projects: ProjectSource[]): void {
  const allFiles: string[] = [];

  // For workspace projects, open the workspace root Ballerina.toml first so the LSP
  // can resolve cross-package dependencies when checking diagnostics per-package.
  const isWorkspace = StateMachine.context().projectInfo?.projectKind === PROJECT_KIND.WORKSPACE_PROJECT;
  if (isWorkspace) {
    const workspaceTomlPath = path.join(tempProjectPath, 'Ballerina.toml');
    if (fs.existsSync(workspaceTomlPath)) {
      allFiles.push('Ballerina.toml');
    }
  }

  projects.forEach(project => {
    const pkgPath = project.packagePath || ""; // Empty for single package, relative path for workspace

    // Add root-level source files
    project.sourceFiles.forEach(f => {
      const relativePath = pkgPath ? path.join(pkgPath, f.filePath) : f.filePath;
      allFiles.push(relativePath);
    });

    // Add module files
    project.projectModules?.forEach(module => {
      module.sourceFiles.forEach(f => {
        const relativePath = pkgPath
          ? path.join(pkgPath, 'modules', module.moduleName, f.filePath)
          : path.join('modules', module.moduleName, f.filePath);
        allFiles.push(relativePath);
      });
    });

    // Add test files
    if (project.projectTests) {
      project.projectTests.forEach(f => {
        const relativePath = pkgPath
          ? path.join(pkgPath, 'tests', f.filePath)
          : path.join('tests', f.filePath);
        allFiles.push(relativePath);
      });
    }
  });

  const tomlFiles = allFiles.filter(f => f.endsWith('Ballerina.toml'));
  console.log(`[AgentNotification] Sending didOpen for ${tomlFiles.length} Ballerina.toml(s) across ${projects.length} project(s)`);
  tomlFiles.forEach(file => seedAiBaseline(tempProjectPath, file));
}

/**
 * Sends didClose notifications for a file to both file:// and ai:// schemas
 * Used for cleanup when temp project is deleted or replaced
 * @param tempProjectPath The root path of the temporary project
 * @param filePath The relative file path
 */
function sendBothSchemaDidClose(tempProjectPath: string, filePath: string): void {
  try {
    const fullPath = path.join(tempProjectPath, filePath);

    const fileUri = Uri.file(fullPath).toString();
    try {
      StateMachine.langClient().didClose({
        textDocument: {
          uri: fileUri
        }
      });
    } catch (error) {
      console.error(`[AgentNotification] Failed didClose (file schema) for ${filePath}:`, error);
    }

    evictAiBaseline(fullPath);
  } catch (error) {
    console.error(`[AgentNotification] Failed to send didClose for ${filePath}:`, error);
  }
}

/**
 * Sends didClose notifications for multiple files in batch
 * Used when cleaning up entire temp project
 * @param tempProjectPath The root path of the temporary project
 * @param files Array of relative file paths to close
 */
export function sendAgentDidCloseBatch(tempProjectPath: string, files: string[]): void {
  files.forEach(file => sendBothSchemaDidClose(tempProjectPath, file));
}

/**
 * Re-opens a generation's modified files in the Language Server after it has restarted
 * (e.g. a VS Code window reload): the in-memory ai:// (frozen original baseline) and
 * file:// (live/modified) documents are gone. The project on disk holds the live content;
 * the original comes from the review baseline dir when present, otherwise the checkpoint
 * snapshot. Restores both schemas so semantic diff and flow-model lookups work.
 * @param tempProjectPath The root path of the project (real workspace root in direct-edit mode)
 * @param modifiedFiles Relative paths of the generation's modified files
 * @param baselineProjectPath Frozen pre-generation sources dir, when one exists (temp-copy flows).
 * Undefined in direct-edit mode, where fallbackOriginalContents supplies the originals.
 * @param fallbackOriginalContents Checkpoint snapshot of pre-generation content — the original source
 * in direct-edit mode, and a fallback for payloads written before baselines existed.
 */
export function sendReviewRestoreDidOpenBatch(
  tempProjectPath: string,
  modifiedFiles: string[],
  baselineProjectPath: string | undefined,
  fallbackOriginalContents?: Record<string, string>
): void {
  const normalizedTempRoot = path.resolve(tempProjectPath);
  const baselineAvailable = !!baselineProjectPath && fs.existsSync(baselineProjectPath);
  const restored: { filePath: string; aiUri: string; originalContent: string }[] = [];

  for (const filePath of modifiedFiles) {
    if (!filePath.endsWith('.bal') && !filePath.endsWith('Ballerina.toml')) {
      continue;
    }

    try {
      const tempFileFullPath = path.resolve(tempProjectPath, filePath);
      if (tempFileFullPath !== normalizedTempRoot && !tempFileFullPath.startsWith(normalizedTempRoot + path.sep)) {
        console.warn(`[AgentNotification] Review restore path escapes temp project, skipping: ${filePath}`);
        continue;
      }

      const snapshotKey = filePath.split(path.sep).join('/');
      const tempFileExists = fs.existsSync(tempFileFullPath);
      const baselineFileFullPath = baselineProjectPath ? path.resolve(baselineProjectPath, filePath) : undefined;
      const baselineFileExists = !!baselineFileFullPath && baselineAvailable && fs.existsSync(baselineFileFullPath);
      const hasFallbackOriginal = Object.prototype.hasOwnProperty.call(fallbackOriginalContents ?? {}, snapshotKey);

      let originalContent: string;
      if (baselineFileExists) {
        originalContent = fs.readFileSync(baselineFileFullPath!, 'utf-8');
      } else if (hasFallbackOriginal) {
        originalContent = fallbackOriginalContents![snapshotKey];
      } else if (baselineAvailable) {
        // The baseline is authoritative: absence means the generation created this file.
        originalContent = '';
      } else {
        console.warn(`[AgentNotification] Original content unavailable, skipping review restore: ${filePath}`);
        continue;
      }

      if (!tempFileExists && !baselineFileExists && !hasFallbackOriginal) {
        console.warn(`[AgentNotification] File is absent from both review versions, skipping: ${filePath}`);
        continue;
      }

      // Empty modified content explicitly represents a whole-file deletion.
      const modifiedContent = tempFileExists ? fs.readFileSync(tempFileFullPath, 'utf-8') : '';
      const languageId = filePath.endsWith('.bal') ? 'ballerina' : 'toml';
      const tempFileUri = Uri.file(tempFileFullPath).toString();
      const aiUri = toAiUri(tempFileFullPath);

      // ai:// = frozen original baseline, file:// = live/modified (getSemanticDiff diffs ai://→file://).
      StateMachine.langClient().didOpen({
        textDocument: { uri: tempFileUri, languageId, version: 1, text: modifiedContent }
      });
      evictAiBaseline(tempFileFullPath);
      restored.push({ filePath, aiUri, originalContent });
    } catch (error) {
      console.error(`[AgentNotification] Failed to restore review schemas for ${filePath}:`, error);
    }
  }

  // State the originals as changes rather than opening each file: the first change rebuilds
  // the package from the live sources on disk and the rest update documents in place, so the
  // batch costs one rebuild instead of one per file — and no file's original is clobbered by
  // the next file's rebuild. See the module notes on the ai:// baseline.
  for (const { filePath, aiUri, originalContent } of restored) {
    try {
      StateMachine.langClient().didChange({
        textDocument: { uri: aiUri, version: 2 },
        contentChanges: [{ text: originalContent }]
      });
      console.log(`[AgentNotification] Restored review schemas for: ${filePath}`);
    } catch (error) {
      console.error(`[AgentNotification] Failed to restore the ai:// baseline for ${filePath}:`, error);
    }
  }
}
