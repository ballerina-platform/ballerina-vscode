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
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import React, { useState } from 'react';
import styled from '@emotion/styled';
import { ActionButtons, CheckBox, Divider, ProgressIndicator, SidePanelBody } from '@wso2/ui-toolkit';
import { FunctionModel, ParameterModel } from '@wso2/ballerina-core';
import { ResourcePath } from '../ResourceForm/ResourcePath/ResourcePath';

/**
 * The request headers option of a chat agent's `chat` or `decision` resource: an optional,
 * editable `http:Headers` parameter. Resources without one have nothing to configure.
 */
export function findHeadersOption(model?: FunctionModel): ParameterModel | undefined {
    return model?.parameters?.find(
        (param) => param.advanced === true && param.editable !== false && !!param.type?.value?.endsWith(":Headers")
    );
}

// Read-only, the path row has no "+ Path Param" button under it, which is what spaces the HTTP
// form's divider from the fields. This keeps a similar gap.
const ResourcePathContainer = styled.div`
    margin-bottom: 16px;
`;

export interface AiResourceFormProps {
    model: FunctionModel;
    isSaving?: boolean;
    onSave: (model: FunctionModel) => void;
    onClose: () => void;
}

/**
 * Edits a chat agent's `chat` or `decision` resource. The path, payload and return type are fixed
 * by the agent runtime, so the only setting is whether the resource takes the request headers.
 */
export function AiResourceForm(props: AiResourceFormProps) {
    const { model, isSaving, onSave, onClose } = props;
    const option = findHeadersOption(model);
    const [enabled, setEnabled] = useState<boolean>(option?.enabled ?? false);

    const handleSave = () => {
        onSave({
            ...model,
            parameters: model.parameters.map((param) => (param === option ? { ...param, enabled } : param)),
        });
    };

    return (
        <>
            {isSaving && <ProgressIndicator id="resource-loading-bar" />}
            <SidePanelBody>
                {/* Read-only, the way the HTTP form shows a resource that can't be edited. */}
                <ResourcePathContainer>
                    <ResourcePath method={model.accessor} path={model.name} onChange={() => {}} onError={() => {}}
                        readonly />
                </ResourcePathContainer>
                <Divider />
                {option && (
                    <CheckBox
                        label={option.metadata?.label ?? "Headers"}
                        checked={enabled}
                        onChange={setEnabled}
                        sx={{ description: option.metadata?.description }}
                    />
                )}
                <ActionButtons
                    primaryButton={{
                        text: isSaving ? "Saving..." : "Save",
                        onClick: handleSave,
                        tooltip: isSaving ? "Saving..." : "Save",
                        disabled: isSaving || !option || enabled === option.enabled,
                        loading: isSaving,
                    }}
                    secondaryButton={{ text: "Cancel", onClick: onClose, tooltip: "Cancel", disabled: isSaving }}
                    sx={{ justifyContent: "flex-end", marginTop: 16 }}
                />
            </SidePanelBody>
        </>
    );
}
