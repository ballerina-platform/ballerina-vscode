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
import { EnsureAiBaselineResponse, ProjectSource, PROJECT_KIND } from "@wso2/ballerina-core";
import { mapWithConcurrency } from "../concurrency";

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

/** The baseline payload for one package: every .bal/toml file with its pre-edit content. */
function collectBaselineFiles(project: ProjectSource): { filePath: string; content: string }[] {
  const files: { filePath: string; content: string }[] = [];

  project.sourceFiles.forEach(f => {
    if (f.filePath.endsWith('.bal') || f.filePath.endsWith('.toml')) {
      files.push({ filePath: f.filePath, content: f.content ?? '' });
    }
  });
  project.projectModules?.forEach(module => {
    module.sourceFiles.forEach(f => {
      if (f.filePath.endsWith('.bal')) {
        files.push({
          filePath: path.join('modules', module.moduleName, f.filePath),
          content: f.content ?? '',
        });
      }
    });
  });
  project.projectTests?.forEach(f => {
    if (f.filePath.endsWith('.bal')) {
      files.push({ filePath: path.join('tests', f.filePath), content: f.content ?? '' });
    }
  });
  return files;
}

/**
 * Establishes the ai:// frozen baseline for every package from the in-hand pre-edit
 * contents (ProjectSource), via the LS ensureAiBaseline request. Unlike the notification
 * protocol, the LS applies everything before responding — awaiting this call guarantees
 * the baseline is in place before the first edit can land, killing the seed↔edit race.
 * Falls back to the legacy notification seed for a package if the request fails.
 * @param tempProjectPath The root path of the project (the real workspace/project root)
 * @param projects Array of project sources containing source files, modules, and tests
 */
/**
 * Rejects an ensureAiBaseline response that failed outright or seeded only part of the
 * baseline. A partially seeded baseline is worse than the racy didOpen fallback the callers'
 * catch blocks run: the unseeded files would diff against post-edit disk and read as unchanged.
 */
function assertBaselineSeeded(res: EnsureAiBaselineResponse | undefined): void {
  if (!res) {
    throw new Error('ensureAiBaseline returned no response');
  }
  if (res.errorMsg) {
    throw new Error(res.errorMsg);
  }
  if (res.failedFiles?.length) {
    throw new Error(`could not seed ${res.failedFiles.length} file(s): ${res.failedFiles.join(', ')}`);
  }
}

export async function seedAiBaselines(tempProjectPath: string, projects: ProjectSource[]): Promise<void> {
  const isWorkspace = StateMachine.context().projectInfo?.projectKind === PROJECT_KIND.WORKSPACE_PROJECT;

  // Workspace root first, so the LS can resolve cross-package dependencies.
  if (isWorkspace) {
    const workspaceTomlPath = path.join(tempProjectPath, 'Ballerina.toml');
    if (fs.existsSync(workspaceTomlPath)) {
      try {
        const content = fs.readFileSync(workspaceTomlPath, 'utf-8');
        const res = await StateMachine.langClient().ensureAiBaseline({
          projectPath: tempProjectPath,
          files: [{ filePath: 'Ballerina.toml', content }],
        });
        assertBaselineSeeded(res);
      } catch (error) {
        console.error('[AgentNotification] ensureAiBaseline failed for workspace root, falling back:', error);
        seedAiBaseline(tempProjectPath, 'Ballerina.toml');
      }
    }
  }

  // Packages are independent project roots on the LS side (per-project locks), so seed
  // them concurrently — only the workspace-root toml above must land first. Bounded,
  // because this runs every turn over every package in the workspace and each request
  // rebuilds that package's ai:// project.
  await mapWithConcurrency(projects, 4, async project => {
    const pkgPath = project.packagePath || '';
    const packageRoot = pkgPath ? path.join(tempProjectPath, pkgPath) : tempProjectPath;
    const files = collectBaselineFiles(project);
    try {
      const res = await StateMachine.langClient().ensureAiBaseline({ projectPath: packageRoot, files });
      assertBaselineSeeded(res);
      console.log(`[AgentNotification] Seeded ai:// baseline (${res?.seededFileCount ?? 0} files) for: ${packageRoot}`);
    } catch (error) {
      // Older LS or request failure: fall back to the racy-but-working notification seed.
      console.error(`[AgentNotification] ensureAiBaseline failed for ${packageRoot}, falling back to didOpen seed:`, error);
      const tomlRel = pkgPath ? path.join(pkgPath, 'Ballerina.toml') : 'Ballerina.toml';
      seedAiBaseline(tempProjectPath, tomlRel);
    }
  });
}

/**
 * Freezes the ai:// baseline for a package the agent just created mid-run (it wrote a new
 * Ballerina.toml). Without this, the package has no cached ai:// project, so the first
 * getSemanticDiff loads the baseline from post-edit disk and the whole package diffs
 * against itself as "no changes". The baseline is the just-written toml plus explicit
 * empty content for any .bal files this generation already wrote into the package —
 * everything the run adds afterwards then registers as an addition.
 * @param packageRoot Absolute path of the new package
 * @param tomlContent The Ballerina.toml content just written
 * @param preexistingBalFiles Package-relative .bal paths this generation already created
 */
export async function seedNewPackageBaseline(
  packageRoot: string,
  tomlContent: string,
  preexistingBalFiles: string[]
): Promise<void> {
  const files = [
    { filePath: 'Ballerina.toml', content: tomlContent },
    ...preexistingBalFiles.map(filePath => ({ filePath, content: '' })),
  ];
  try {
    const res = await StateMachine.langClient().ensureAiBaseline({ projectPath: packageRoot, files });
    assertBaselineSeeded(res);
    console.log(`[AgentNotification] Seeded ai:// baseline for new package: ${packageRoot}`);
  } catch (error) {
    // Same policy as seedAiBaselines: fall back to the notification seed. Right after the
    // toml write the disk state is still close to the intended baseline, so a racy seed
    // beats no baseline at all (which would make the whole package diff as unchanged).
    console.error(`[AgentNotification] ensureAiBaseline failed for new package ${packageRoot}, falling back to didOpen seed:`, error);
    seedAiBaseline(packageRoot, 'Ballerina.toml');
  }
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
): { restoredCount: number; skippedCount: number } {
  const normalizedTempRoot = path.resolve(tempProjectPath);
  const baselineAvailable = !!baselineProjectPath && fs.existsSync(baselineProjectPath);
  let skippedCount = 0;
  const restored: { filePath: string; aiUri: string; originalContent: string }[] = [];

  for (const filePath of modifiedFiles) {
    if (!filePath.endsWith('.bal') && !filePath.endsWith('Ballerina.toml')) {
      continue;
    }

    try {
      const tempFileFullPath = path.resolve(tempProjectPath, filePath);
      if (tempFileFullPath !== normalizedTempRoot && !tempFileFullPath.startsWith(normalizedTempRoot + path.sep)) {
        console.warn(`[AgentNotification] Review restore path escapes temp project, skipping: ${filePath}`);
        skippedCount++;
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
      } else if (fallbackOriginalContents !== undefined) {
        // A checkpoint snapshot exists but has no entry for this file — it did not exist
        // when the snapshot was captured, i.e. the generation created it. An empty
        // original makes it read as an addition, matching the live-run behavior.
        originalContent = '';
      } else {
        console.warn(`[AgentNotification] Original content unavailable, skipping review restore: ${filePath}`);
        skippedCount++;
        continue;
      }

      if (!tempFileExists && !baselineFileExists && !hasFallbackOriginal) {
        console.warn(`[AgentNotification] File is absent from both review versions, skipping: ${filePath}`);
        skippedCount++;
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
      // Counts as skipped: without it a total failure through this path would return
      // {restoredCount: 0, skippedCount: 0} and read as "nothing needed restoring".
      skippedCount++;
      console.error(`[AgentNotification] Failed to restore review schemas for ${filePath}:`, error);
    }
  }

  // State the originals as changes rather than opening each file: the first change rebuilds
  // the package from the live sources on disk and the rest update documents in place, so the
  // batch costs one rebuild instead of one per file — and no file's original is clobbered by
  // the next file's rebuild. See the module notes on the ai:// baseline.
  let restoredCount = 0;
  for (const { filePath, aiUri, originalContent } of restored) {
    try {
      StateMachine.langClient().didChange({
        textDocument: { uri: aiUri, version: 2 },
        contentChanges: [{ text: originalContent }]
      });
      restoredCount++;
      console.log(`[AgentNotification] Restored review schemas for: ${filePath}`);
    } catch (error) {
      // A file whose baseline never landed counts as skipped, not restored — otherwise a
      // total didChange failure would still report every file restored and suppress the
      // caller's unavailable-originals warning.
      skippedCount++;
      console.error(`[AgentNotification] Failed to restore the ai:// baseline for ${filePath}:`, error);
    }
  }

  return { restoredCount, skippedCount };
}
