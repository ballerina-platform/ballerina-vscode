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

import { MigrationTool } from "@wso2/ballerina-core";
import { Dropdown, OptionProps, TextField, Typography } from "@wso2/ui-toolkit";
import React from "react";
import { BodyText, ParameterItem, ParametersSection } from "../styles";
import styled from "@emotion/styled";

const ParametersContainer = styled.div`
    display: flex;
    flex-direction: column;
    gap: 16px;
    margin-top: 16px;
`;

interface IntegrationParametersProps {
    selectedIntegration: MigrationTool;
    integrationParams: Record<string, any>;
    onParameterChange: (paramKey: string, value: any) => void;
}

export const IntegrationParameters: React.FC<IntegrationParametersProps> = ({
    selectedIntegration,
    integrationParams,
    onParameterChange,
}) => {
    const nonBoolParams = selectedIntegration?.parameters.filter(p => p.valueType !== "boolean") ?? [];
    if (!selectedIntegration || !nonBoolParams.length) return null;

    return (
        <ParametersSection>
            <Typography variant="h3" sx={{ marginBottom: 12 }}>
                Configure {selectedIntegration.title} Settings
            </Typography>
            <BodyText>{`Configure additional settings for ${selectedIntegration.title} migration.`}</BodyText>
            <ParametersContainer>
                {nonBoolParams.map((param) => (
                    <ParameterItem key={param.key}>
                        {param.valueType === "enum" && param.options ? (
                            <Dropdown
                                id={`${param.key}-dropdown`}
                                label={param.label}
                                description={param.description}
                                value={integrationParams[param.key] || param.defaultValue || param.options[0]}
                                items={param.options.map(option => ({
                                    id: option,
                                    content: option
                                } as OptionProps))}
                                onChange={(e) => onParameterChange(param.key, e.target.value)}
                                containerSx={{
                                    position: 'relative',
                                    '& vscode-dropdown::part(listbox)': {
                                        position: 'absolute !important',
                                        top: '100% !important',
                                        bottom: 'auto !important',
                                        transform: 'none !important',
                                        marginTop: '2px !important'
                                    }
                                }}
                            />
                        ) : (
                            <TextField
                                value={integrationParams[param.key] || ""}
                                description={param.description}
                                onTextChange={(value) => onParameterChange(param.key, value)}
                                label={param.label}
                                placeholder={`Enter ${param.label.toLowerCase()}`}
                            />
                        )}
                    </ParameterItem>
                ))}
            </ParametersContainer>
        </ParametersSection>
    );
};
