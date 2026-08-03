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
import { ValidateProjectFormErrorField } from "./shims/wi-core";

interface RealtimeProjectPathValidationOptions {
    wsClient: {
        validateProjectPath: (payload: {
            projectPath: string;
            projectName: string;
            createDirectory: boolean;
            createAsWorkspace?: boolean;
        }) => Promise<{
            isValid: boolean;
            errorField?: ValidateProjectFormErrorField;
            errorMessage?: string;
        }>;
    };
    projectPath: string;
    projectName: string;
    createAsWorkspace: boolean;
    pathTouched: boolean;
    requiredPathMessage: string;
    invalidPathMessage: string;
    onPathErrorChange: (error: string | null) => void;
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
}: RealtimeProjectPathValidationOptions) {
    const validationRequestId = useRef(0);
    const debouncedValidatePath = useMemo(
        () => debounce(async (
            requestId: number,
            trimmedPath: string,
            trimmedProjectName: string,
            validateAsWorkspace: boolean,
        ) => {
            try {
                const validationResult = await wsClient.validateProjectPath({
                    projectPath: trimmedPath,
                    projectName: trimmedProjectName,
                    createDirectory: true,
                    createAsWorkspace: validateAsWorkspace,
                });

                if (validationRequestId.current !== requestId) {
                    return;
                }

                if (!validationResult.isValid && validationResult.errorField === ValidateProjectFormErrorField.PATH) {
                    onPathErrorChange(validationResult.errorMessage || invalidPathMessage);
                    return;
                }

                onPathErrorChange(null);
            } catch {
                if (validationRequestId.current !== requestId) {
                    return;
                }

                onPathErrorChange(null);
            }
        }, 300),
        [invalidPathMessage, onPathErrorChange, wsClient]
    );

    useEffect(() => {
        if (!pathTouched) {
            validationRequestId.current += 1;
            debouncedValidatePath.cancel();
            onPathErrorChange(null);
            return;
        }

        const trimmedPath = projectPath.trim();
        if (!trimmedPath) {
            validationRequestId.current += 1;
            debouncedValidatePath.cancel();
            onPathErrorChange(requiredPathMessage);
            return;
        }

        const trimmedProjectName = projectName.trim();
        if (!trimmedProjectName) {
            validationRequestId.current += 1;
            debouncedValidatePath.cancel();
            onPathErrorChange(null);
            return;
        }

        const requestId = validationRequestId.current + 1;
        validationRequestId.current = requestId;
        debouncedValidatePath(requestId, trimmedPath, trimmedProjectName, createAsWorkspace);

        return () => {
            debouncedValidatePath.cancel();
        };
    }, [
        createAsWorkspace,
        debouncedValidatePath,
        invalidPathMessage,
        onPathErrorChange,
        pathTouched,
        projectName,
        projectPath,
        requiredPathMessage,
        wsClient,
    ]);
}
