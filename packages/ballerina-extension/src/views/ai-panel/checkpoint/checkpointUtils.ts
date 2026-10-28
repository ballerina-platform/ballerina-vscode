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

import * as path from 'path';
import { Checkpoint } from '@wso2/ballerina-core/lib/state-machine-types';
import { getCheckpointService } from './checkpointService';
import { CheckpointUnknownFormatError } from './types';

export { renderDatamapper } from './restoreApplier';

export async function captureWorkspaceSnapshot(projectRootPath: string, messageId: string): Promise<Checkpoint | null> {
    return getCheckpointService(projectRootPath).capture(messageId);
}

export async function restoreWorkspaceSnapshot(
    projectRootPath: string, checkpoint: Checkpoint, skipArtifactWait = false
): Promise<boolean> {
    return getCheckpointService(projectRootPath).restore(checkpoint, { skipArtifactWait });
}

export type DiffOriginal =
    | { kind: 'content'; content: string }
    | { kind: 'unavailable'; message: string }
    | { kind: 'newerFormat' };

const UNAVAILABLE_ORIGINAL_MESSAGES = {
    tooLarge: 'This file is too large to be included in the checkpoint, so there is no earlier version to compare.',
    unreadable: 'This file could not be read when the checkpoint was taken, so there is no earlier version to compare.',
    missing: 'The earlier version of this file is missing from the checkpoint, so it cannot be compared.',
};

export async function readDiffOriginal(
    projectRootPath: string, checkpoint: Checkpoint | undefined, relativePath: string
): Promise<DiffOriginal> {
    if (!checkpoint) {
        return { kind: 'content', content: '' };
    }
    let originals;
    try {
        originals = await getCheckpointService(projectRootPath).readOriginals(checkpoint, [relativePath]);
    } catch (error) {
        if (error instanceof CheckpointUnknownFormatError) {
            return { kind: 'newerFormat' };
        }
        console.error(`[Checkpoint] Cannot read the original of ${relativePath}:`, error);
        return { kind: 'unavailable', message: UNAVAILABLE_ORIGINAL_MESSAGES.missing };
    }
    const original = originals.get(relativePath.split(path.sep).join('/'));
    if (original?.state === 'content') {
        return { kind: 'content', content: original.bytes.toString('utf8') };
    }
    if (original?.state === 'unavailable') {
        return { kind: 'unavailable', message: UNAVAILABLE_ORIGINAL_MESSAGES[original.reason] };
    }
    return { kind: 'content', content: '' };
}
