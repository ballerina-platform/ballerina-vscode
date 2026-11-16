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

// The Deploy panel's Microsoft Foundry card: builds a container image that runs the agent as a Foundry hosted agent.

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { imageReferenceError } from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { Button, CheckBox, TextField } from "@wso2/ui-toolkit";
import { Actions, Stack } from "./shared";

export interface FoundrySectionProps {
    projectPath: string;
    active: boolean;
    noun: string;
    /** Whether the package has something to deploy; when not, `disabledReason` explains why. */
    enabled: boolean;
    disabledReason: string;
}

export function FoundrySection({ projectPath, active, noun, enabled, disabledReason }: FoundrySectionProps) {
    const { rpcClient } = useRpcContext();
    const { data } = useQuery({
        queryKey: ["foundryImage", projectPath],
        queryFn: () => rpcClient.getBIDiagramRpcClient().getFoundryImage({ projectPath }),
        enabled: active && !!projectPath,
    });
    // Follows the package's name and version until the user types a name of their own.
    const [editedImage, setEditedImage] = useState<string>();
    const [tracing, setTracing] = useState(true);
    // A second build while one runs would scaffold and build the same package twice.
    const [building, setBuilding] = useState(false);
    const imageReference = (editedImage ?? data?.imageReference ?? "").trim();
    // An empty field only gets an error once the user has cleared it, not while the default is loading.
    const imageError = imageReference || editedImage !== undefined ? imageReferenceError(imageReference) : undefined;

    const build = async () => {
        setBuilding(true);
        try {
            await rpcClient.getBIDiagramRpcClient().buildFoundryImage({ projectPath, imageReference, tracing });
        } finally {
            setBuilding(false);
        }
    };

    return (
        <Stack>
            <p style={{ margin: 0 }}>Build a container image to run this {noun} as a Microsoft Foundry hosted agent.</p>
            <TextField
                id="foundry-image-name"
                label="Image Name"
                value={editedImage ?? data?.imageReference ?? ""}
                onTextChange={setEditedImage}
                placeholder="name:tag"
                errorMsg={imageError ?? data?.error}
            />
            <CheckBox checked={tracing} onChange={setTracing} label="Export traces to Application Insights" />
            <Actions>
                <Button
                    appearance="secondary"
                    onClick={build}
                    disabled={building || !enabled || !imageReference || !!imageError}
                    tooltip={enabled ? "" : disabledReason}
                >
                    {building ? "Building…" : "Build Image"}
                </Button>
            </Actions>
        </Stack>
    );
}
