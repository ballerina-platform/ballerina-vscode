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

import { useEffect, useMemo, useRef } from "react";
import debounce from "lodash/debounce";
import { ValidateProjectFormErrorField } from "@wso2/ballerina-core";

/**
 * Minimal structural contract for the client used to validate a project path.
 * Both the wizard's BiWsClient and the legacy embedded WiBridgeClient satisfy it.
 */
export interface ProjectPathValidationClient {
    validateProjectPath(payload: {
        projectPath: string;
        projectName: string;
        createDirectory: boolean;
        createAsWorkspace?: boolean;
        directoryName?: string;
        allowExistingDirectory?: boolean;
    }): Promise<{
        isValid: boolean;
        errorField?: ValidateProjectFormErrorField;
        errorMessage?: string;
        existingWorkspace?: boolean;
    }>;
}

interface RealtimeProjectPathValidationOptions {
    wsClient: ProjectPathValidationClient;
    projectPath: string;
    projectName: string;
    createAsWorkspace: boolean;
    pathTouched: boolean;
    requiredPathMessage: string;
    invalidPathMessage: string;
    onPathErrorChange: (error: string | null) => void;
    directoryName?: string;
    /** Allow the target directory to already exist (unless it is a Ballerina project). */
    allowExistingDirectory?: boolean;
    /**
     * Reports whether the current path resolves inside an existing Ballerina
     * workspace (a "project") — the new integration/library will be added into it.
     * Called with `false` whenever there is a path error or the path is cleared.
     */
    onExistingWorkspaceChange?: (isWorkspace: boolean) => void;
}

export function useRealtimeProjectPathValidation({
    wsClient,
    projectPath,
    projectName,
    createAsWorkspace,
    pathTouched,
    requiredPathMessage,
    invalidPathMessage,
    onPathErrorChange,
    directoryName,
    allowExistingDirectory,
    onExistingWorkspaceChange,
}: RealtimeProjectPathValidationOptions) {
    const validationRequestId = useRef(0);
    const debouncedValidatePath = useMemo(
        () => debounce(async (
            requestId: number,
            trimmedPath: string,
            trimmedProjectName: string,
            validateAsWorkspace: boolean,
            folderName: string | undefined,
            allowExisting: boolean | undefined,
        ) => {
            try {
                const validationResult = await wsClient.validateProjectPath({
                    projectPath: trimmedPath,
                    projectName: trimmedProjectName,
                    createDirectory: true,
                    createAsWorkspace: validateAsWorkspace,
                    directoryName: folderName,
                    allowExistingDirectory: allowExisting,
                });

                if (validationRequestId.current !== requestId) {
                    return;
                }

                if (!validationResult.isValid && validationResult.errorField === ValidateProjectFormErrorField.PATH) {
                    onPathErrorChange(validationResult.errorMessage || invalidPathMessage);
                    onExistingWorkspaceChange?.(false);
                    return;
                }

                onPathErrorChange(null);
                onExistingWorkspaceChange?.(validationResult.existingWorkspace === true);
            } catch {
                if (validationRequestId.current !== requestId) {
                    return;
                }

                onPathErrorChange(null);
                onExistingWorkspaceChange?.(false);
            }
        }, 300),
        [invalidPathMessage, onExistingWorkspaceChange, onPathErrorChange, wsClient]
    );

    useEffect(() => {
        if (!pathTouched) {
            validationRequestId.current += 1;
            debouncedValidatePath.cancel();
            onPathErrorChange(null);
            onExistingWorkspaceChange?.(false);
            return;
        }

        const trimmedPath = projectPath.trim();
        if (!trimmedPath) {
            validationRequestId.current += 1;
            debouncedValidatePath.cancel();
            onPathErrorChange(requiredPathMessage);
            onExistingWorkspaceChange?.(false);
            return;
        }

        const trimmedProjectName = projectName.trim();
        if (!trimmedProjectName) {
            validationRequestId.current += 1;
            debouncedValidatePath.cancel();
            onPathErrorChange(null);
            onExistingWorkspaceChange?.(false);
            return;
        }

        const requestId = validationRequestId.current + 1;
        validationRequestId.current = requestId;
        debouncedValidatePath(requestId, trimmedPath, trimmedProjectName, createAsWorkspace, directoryName?.trim() || undefined, allowExistingDirectory);

        return () => {
            debouncedValidatePath.cancel();
        };
    }, [
        allowExistingDirectory,
        createAsWorkspace,
        debouncedValidatePath,
        directoryName,
        invalidPathMessage,
        onExistingWorkspaceChange,
        onPathErrorChange,
        pathTouched,
        projectName,
        projectPath,
        requiredPathMessage,
        wsClient,
    ]);
}
