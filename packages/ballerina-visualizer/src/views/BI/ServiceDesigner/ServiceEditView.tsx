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

import { useEffect, useRef, useState } from 'react';
import { ServiceModel, NodePosition, LineRange, EVENT_TYPE, ValidationResult, hasBlockingValidationErrors } from '@wso2/ballerina-core';
import { useRpcContext } from '@wso2/ballerina-rpc-client';
import ServiceConfigForm from './Forms/ServiceConfigForm';
export interface ServiceEditViewProps {
    filePath: string;
    position: NodePosition;
    onChange?: (data: ServiceModel, filePath: string, position: NodePosition) => void;
    onDirtyChange?: (isDirty: boolean, filePath: string, position: NodePosition) => void;
    onValidityChange?: (isValid: boolean) => void;
}

export function ServiceEditView(props: ServiceEditViewProps) {
    const { filePath, position, onChange, onDirtyChange, onValidityChange } = props;
    const { rpcClient } = useRpcContext();
    const [serviceModel, setServiceModel] = useState<ServiceModel>(undefined);

    const [saving, setSaving] = useState<boolean>(false);
    const [serverValidationErrors, setServerValidationErrors] = useState<ValidationResult[]>([]);

    const isMountedRef = useRef(true);

    useEffect(() => {
        isMountedRef.current = true;
        const lineRange: LineRange = { startLine: { line: position.startLine, offset: position.startColumn }, endLine: { line: position.endLine, offset: position.endColumn } };
        rpcClient.getServiceDesignerRpcClient().getServiceModelFromCode({ filePath, codedata: { lineRange } }).then(res => {
            if (isMountedRef.current) {
                setServiceModel(res.service);
            }
        })
        return () => {
            isMountedRef.current = false;
        };
    }, [props.filePath, props.position]);

    const onSubmit = async (value: ServiceModel) => {
        setSaving(true);
        const res = await rpcClient.getServiceDesignerRpcClient().updateServiceSourceCode({ filePath, service: value });
        if (!isMountedRef.current) {
            return;
        }
        // Refused by the language server's save-time gate — nothing was written, so keep the form
        // open with the failures on their fields instead of hanging on "Saving". A WARNING is not a
        // rejection and must not trap the form.
        if (hasBlockingValidationErrors(res.validationErrors)) {
            setServerValidationErrors(res.validationErrors);
            setSaving(false);
            return;
        }
        setServerValidationErrors([]);
        const updatedArtifact = res.artifacts.at(0);
        if (updatedArtifact) {
            rpcClient.getVisualizerRpcClient().openView({ type: EVENT_TYPE.OPEN_VIEW, location: { documentUri: updatedArtifact.path, position: updatedArtifact.position } });
            setSaving(false);
            return;
        }
        setSaving(false);
    }

    const handleServiceChange = async (data: ServiceModel) => {
        if (onChange) {
            onChange(data, filePath, position);
        }
    }

    const handleServiceDirtyChange = (isDirty: boolean) => {
        onDirtyChange?.(isDirty, filePath, position);
    }

    return (
        <>
            {serviceModel && <ServiceConfigForm serviceModel={serviceModel} onSubmit={onSubmit} formSubmitText={saving ? "Saving..." : "Save"} isSaving={saving} onChange={handleServiceChange} onDirtyChange={handleServiceDirtyChange} onValidityChange={onValidityChange} serverValidationErrors={serverValidationErrors} />}
        </>
    );
};
