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

import { ProjectStructureArtifactResponse, DIRECTORY_MAP, ArtifactData } from "@wso2/ballerina-core";

// Define the base notification type
interface NotificationType<T> {
    method: string;
}

// Define the notification payload type
interface NotificationPayload {
    data: ProjectStructureArtifactResponse[];
    timestamp: number;
}

// Define the notification type with typed payload
export const ArtifactsUpdated: NotificationType<NotificationPayload> = { method: "artifactsUpdated" };
export const ArtifactsUpdatedWithTimeout: NotificationType<NotificationPayload> = { method: "artifactsUpdatedWithTimeout" };

export class ArtifactNotificationHandler {
    private subscribers: Map<string, Set<(payload: NotificationPayload) => void>>;
    private static instance: ArtifactNotificationHandler;

    private constructor() {
        this.subscribers = new Map();
    }

    public static getInstance(): ArtifactNotificationHandler {
        if (!ArtifactNotificationHandler.instance) {
            ArtifactNotificationHandler.instance = new ArtifactNotificationHandler();
        }
        return ArtifactNotificationHandler.instance;
    }

    // Subscribe with type filtering
    public subscribe(
        notificationType: string,
        artifactData: ArtifactData,
        callback: (payload: NotificationPayload) => void
    ): () => void {
        if (!this.subscribers.has(notificationType)) {
            this.subscribers.set(notificationType, new Set());
        }

        const subscribers = this.subscribers.get(notificationType)!;

        // Create a wrapper callback that filters the data
        const wrappedCallback = (payload: NotificationPayload) => {
            let filteredData = payload.data;
            if (artifactData) {
                filteredData = filteredData.filter(data => data.type === artifactData.artifactType);
                if (artifactData.identifier) {
                    filteredData = filteredData.filter(data => data.name === artifactData.identifier);
                }
            }
            callback({
                ...payload,
                data: filteredData
            });
        };

        subscribers.add(wrappedCallback);

        // Return unsubscribe function
        return () => {
            subscribers.delete(wrappedCallback);
            if (subscribers.size === 0) {
                this.subscribers.delete(notificationType);
            }
        };
    }

    // Publish a notification to all subscribers
    public publish(notificationType: string, payload: NotificationPayload): void {
        const subscribers = this.subscribers.get(notificationType);
        if (subscribers) {
            subscribers.forEach(callback => {
                try {
                    callback(payload);
                } catch (error) {
                    console.error(`Error in notification handler for ${notificationType}:`, error);
                }
            });
        }
    }
}

export const ARTIFACT_UPDATE_TIMEOUT_MS = 10000;

export interface ArtifactUpdateWait {
    /** Resolves `true` on the notification, `false` once the timeout passes without one. */
    notified: Promise<boolean>;
    cancel: () => void;
}

/**
 * Starts a one-shot wait for the next artifact update. Arm it *before* the edit that triggers the
 * notification: {@code publish} has no replay, so anything published in between is lost and the
 * wait then always times out.
 *
 * It never rejects — an update can legitimately never arrive (the Language Server is busy, or the
 * edit produced no artifact change), which says nothing about whether the edit itself applied.
 */
export function startArtifactUpdateWait(
    onArtifacts: (artifacts: ProjectStructureArtifactResponse[]) => void,
    timeoutMs: number = ARTIFACT_UPDATE_TIMEOUT_MS
): ArtifactUpdateWait {
    let settle!: (notified: boolean) => void;
    const notified = new Promise<boolean>(resolve => {
        settle = resolve;
    });

    const unsubscribe = ArtifactNotificationHandler.getInstance().subscribe(
        ArtifactsUpdated.method,
        undefined,
        payload => {
            stopListening();
            // Settled before the callback runs: publish() swallows a throwing subscriber, so a
            // failing callback would otherwise leave this promise pending with its timer cleared.
            settle(true);
            try {
                onArtifacts(payload.data);
            } catch (error) {
                console.error('[Artifacts] Artifact-update listener failed:', error);
            }
        }
    );
    const timeoutId = setTimeout(() => {
        stopListening();
        settle(false);
    }, timeoutMs);

    function stopListening(): void {
        clearTimeout(timeoutId);
        unsubscribe();
    }

    return {
        notified,
        cancel: () => {
            stopListening();
            settle(false);
        }
    };
}
