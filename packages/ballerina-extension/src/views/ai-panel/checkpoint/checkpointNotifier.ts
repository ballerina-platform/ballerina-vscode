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

import * as vscode from 'vscode';
import { CheckpointConfig, getCheckpointConfig } from './checkpointConfig';
import { CheckpointNotifier } from './types';
import { resolveCaptureLimits } from './backends/captureSupport';

const SKIPPED_NAMES_SHOWN = 3;

export class VscodeCheckpointNotifier implements CheckpointNotifier {
    private largeFilesNoticeShown = false;

    constructor(private readonly config: () => CheckpointConfig = getCheckpointConfig) {}

    tooLarge(): void {
        const { maxSnapshotSize, maxFileSize } = this.config();
        const { maxNewBytes } = resolveCaptureLimits({ maxFileSize, maxNewBytes: maxSnapshotSize });
        vscode.window.showWarningMessage(
            `Too much new content to checkpoint this turn (over ${Math.round(maxNewBytes / 1024 / 1024)}MB). ` +
            'This generation will not be revertible.'
        );
    }

    largeFilesSkipped(paths: string[]): void {
        if (this.largeFilesNoticeShown || paths.length === 0) {
            return;
        }
        this.largeFilesNoticeShown = true;
        const shown = paths.slice(0, SKIPPED_NAMES_SHOWN).join(', ');
        const rest = paths.length - SKIPPED_NAMES_SHOWN;
        vscode.window.showInformationMessage(
            'Some large files are not included in Copilot checkpoints, so a revert will not change them: ' +
            `${shown}${rest > 0 ? ` and ${rest} more` : ''}.`
        );
    }

    unknownFormat(): void {
        vscode.window.showErrorMessage('This checkpoint was made by a newer version and cannot be restored here.');
    }

    contentUnavailable(reason: string): void {
        console.error(`[Checkpoint] Refusing to restore, checkpoint content is unavailable: ${reason}`);
        vscode.window.showErrorMessage('Cannot restore checkpoint: some of its saved content is missing. Nothing was changed.');
    }
}

export const checkpointNotifier = new VscodeCheckpointNotifier();
