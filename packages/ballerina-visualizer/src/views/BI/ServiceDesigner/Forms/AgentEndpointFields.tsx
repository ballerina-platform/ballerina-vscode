/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com/).
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import React from 'react';
import styled from '@emotion/styled';
import { Divider, ThemeColors, Typography } from '@wso2/ui-toolkit';
import { ConfigProperties, FunctionModel, ParameterModel, PropertyModel, ReturnTypeModel } from '@wso2/ballerina-core';
import { ResourcePath } from './ResourceForm/ResourcePath/ResourcePath';
import { Parameters } from './ResourceForm/Parameters/Parameters';
import { ResourceResponse } from './ResourceForm/ResourceResponse/ResourceResponse';
import { applyMethod } from '../utils';
import { HTTP_METHOD } from '../utils';

const Fields = styled.div`
    align-self: stretch;
    width: 100%;
    display: flex;
    flex-direction: column;
`;

const Continuation = styled.div`
    align-self: stretch;
    width: 100%;
    margin-top: -12px;
    padding: 8px 10px 10px;
    background-color: var(--vscode-input-background);
    border: 1px solid var(--vscode-input-border, ${ThemeColors.OUTLINE_VARIANT});
    border-radius: 3px;
    user-select: none;
    pointer-events: none;
`;

const ContinuationCaption = styled.div`
    font-size: 12px;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    opacity: 0.85;
    margin-bottom: 6px;
`;

const ContinuationBody = styled.div`
    font-family: monospace;
    font-size: 12px;
    line-height: 1.5;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    white-space: pre-wrap;
`;

const ParamName = styled.span`
    color: ${ThemeColors.ON_SURFACE};
    opacity: 0.8;
`;

const Placeholder = styled.span`
    font-family: var(--vscode-font-family);
    font-style: italic;
    opacity: 0.8;
`;

export interface PromptContinuationProps {
    model: FunctionModel;
}

export function PromptContinuation(props: PromptContinuationProps) {
    const appended = appendedParameters(props.model);
    return (
        <Continuation aria-hidden="true">
            <ContinuationCaption>Appended to your instructions</ContinuationCaption>
            <ContinuationBody>
                {appended.length > 0
                    ? appended.map(({ name, type }, index) => (
                        <React.Fragment key={name}>
                            {index > 0 && "\n"}
                            <ParamName>{name}:</ParamName>
                            {` \u27e8${type} value at request time\u27e9`}
                        </React.Fragment>
                    ))
                    : <Placeholder>Add a parameter to send request data to the agent.</Placeholder>}
            </ContinuationBody>
        </Continuation>
    );
}

const PATH_PARAM = /^\[\s*([A-Za-z_][A-Za-z0-9_:]*)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\]$/;

function appendedParameters(model: FunctionModel): { name: string; type: string }[] {
    const fromPath = String(model.name?.value ?? "")
        .split("/")
        .map((segment) => PATH_PARAM.exec(segment.trim()))
        .filter((match): match is RegExpExecArray => Boolean(match))
        .map((match) => ({ type: match[1], name: match[2] }));

    const seen = new Set(fromPath.map((parameter) => parameter.name));
    const fromList = (model.parameters ?? [])
        .filter((parameter) => parameter.enabled && parameter.httpParamType !== "HEADER"
            && parameter.name?.value && parameter.type?.value)
        .map((parameter) => ({ name: parameter.name.value, type: parameter.type.value }))
        .filter((parameter) => !seen.has(parameter.name));

    return [...fromPath, ...fromList];
}

export interface AgentEndpointFieldsProps {
    model: FunctionModel;
    onChange: (model: FunctionModel) => void;
    onError: (hasErrors: boolean) => void;
}

export function AgentEndpointFields(props: AgentEndpointFieldsProps) {
    const { model, onChange, onError } = props;

    const update = (patch: Partial<FunctionModel>) => onChange({ ...model, ...patch });

    const onPathChange = (method: PropertyModel, path: PropertyModel) => {
        const withMethod = applyMethod({ ...model, name: path }, method.value ?? "");
        onChange({ ...withMethod, accessor: method });
    };

    const acceptsPayload = Boolean(model.accessor?.value) && model.accessor.value.toUpperCase() !== "GET";

    return (
        <Fields>
            <ResourcePath
                method={model.accessor}
                path={model.name}
                onChange={onPathChange}
                onError={onError}
            />
            <Divider />
            <Parameters
                parameters={model.parameters}
                onChange={(parameters: ParameterModel[]) => update({ parameters })}
                schemas={model.schema as ConfigProperties}
                showPayload={acceptsPayload}
                pathName={model.name?.value}
            />
            <Typography sx={{ marginBlockEnd: 10 }} variant="h4">Responses</Typography>
            <ResourceResponse
                method={(model.accessor?.value ?? "POST").toUpperCase() as HTTP_METHOD}
                response={model.returnType}
                onChange={(returnType: ReturnTypeModel) => update({ returnType })}
            />
        </Fields>
    );
}
