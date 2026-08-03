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
import { useBiWsContext } from "../wsManager/WsClientContext";
import { ActionButtons, DirectorySelector, Icon, Typography } from "@wso2/ui-toolkit";
import { useState } from "react";
import ButtonCard from "../../../components/ButtonCard";
import { DownloadProgress } from "../../../components/DownloadProgress";
import { IntegrationParameters } from "./components/IntegrationParameters";
import {
    BodyText,
    ButtonWrapper,
    IntegrationCardGrid,
    LoadingOverlayContainer,
    PathText,
    RadioContent,
    RadioDescription,
    RadioGroup,
    RadioInput,
    RadioOption,
    RadioTitle,
    StepContainer,
} from "./styles";
import { FinalIntegrationParams, ImportIntegrationFormProps } from "./types";
import { SELECTION_TEXT } from "./utils";

const SOURCE_DESCRIPTIONS: Record<string, string> = {
    mulesoft: "Select your MuleSoft project directory or a directory containing multiple projects.",
    tibco: "Select your TIBCO BusinessWorks project directory or a directory containing multiple projects.",
};

function getSourceDescription(tool: MigrationTool): string {
    const lower = tool.title.toLowerCase();
    if (lower.includes("mule")) return SOURCE_DESCRIPTIONS.mulesoft;
    if (lower.includes("tibco")) return SOURCE_DESCRIPTIONS.tibco;
    return tool.description;
}

export function ImportIntegrationForm({
    selectedIntegration,
    migrationTools,
    onSelectIntegration,
    pullIntegrationTool,
    setImportParams,
    pullingTool,
    toolPullProgress,
    onNext,
    onBack,
}: ImportIntegrationFormProps) {
    const { wsClient } = useBiWsContext();

    const [importSourcePath, setImportSourcePath] = useState("");
    const [isDirectorySelected, setIsDirectorySelected] = useState(false);
    const [integrationParams, setIntegrationParams] = useState<Record<string, any>>({});

    const isImportDisabled = importSourcePath.length < 2 || !selectedIntegration;

    const boolParam = selectedIntegration?.parameters.find(p => p.valueType === "boolean") ?? null;
    const getBoolValue = (key: string): boolean => {
        const v = integrationParams[key];
        return typeof v === "string" ? v === "true" : v === true;
    };

    const [sourcePathError, setSourcePathError] = useState<string | null>(null);
    const [integrationSelectionError, setIntegrationSelectionError] = useState<string | null>(null);

    const handleIntegrationSelection = (integration: MigrationTool) => {
        // Reset state when a new integration is selected
        setImportSourcePath("");
        setIsDirectorySelected(false);
        setSourcePathError(null);
        setIntegrationSelectionError(null);
        onSelectIntegration(integration);
        const defaultParams = integration.parameters.reduce((acc, param) => {
            acc[param.key] = param.defaultValue;
            return acc;
        }, {} as Record<string, any>);
        setIntegrationParams(defaultParams);
    };

    const handleFolderSelection = async () => {
        const result = await wsClient.selectFileOrFolderPath();
        if (result?.path) {
            setImportSourcePath(result.path);
            // Prefer the authoritative flag from the host picker; fall back to a
            // filename heuristic only when it is absent. (A dotted directory such
            // as `project.v1` would otherwise be misdetected as a file.)
            const lastSegment = result.path.split(/[/\\]/).pop() ?? "";
            setIsDirectorySelected(result.isDirectory ?? !lastSegment.includes("."));
            setSourcePathError(null);
        }
    };

    const handleImportIntegration = () => {
        setSourcePathError(null);
        setIntegrationSelectionError(null);

        // Validate required fields
        let hasError = false;

        if (!selectedIntegration) {
            setIntegrationSelectionError("Please select an integration platform");
            hasError = true;
        }

        if (!importSourcePath || importSourcePath.trim().length === 0) {
            setSourcePathError("Please select your project folder");
            hasError = true;
        }

        if (hasError) {
            return;
        }

        // Store params and always pull the latest migration tool before proceeding.
        const finalParams: FinalIntegrationParams = {
            importSourcePath,
            type: selectedIntegration!.title,
            parameters: integrationParams,
        };

        setImportParams(finalParams);
        pullIntegrationTool(selectedIntegration!.commandName, selectedIntegration!.requiredVersion);
        onNext();
    };

    const handleParameterChange = (paramKey: string, value: any) => {
        setIntegrationParams((prev) => ({
            ...prev,
            [paramKey]: value,
        }));
    };

    return (
        <>
            <BodyText>
                This wizard converts external integration projects from MuleSoft or TIBCO into new WSO2 integrator projects, accelerating the migration process.
            </BodyText>
            <Typography variant="h3" sx={{ marginTop: 20 }}>
                Choose the Source Platform
            </Typography>
            <BodyText>Select the integration platform that your current project uses:</BodyText>
            {integrationSelectionError && (
                <div style={{ color: "var(--vscode-errorForeground)", marginBottom: 8, fontSize: 12 }}>
                    {integrationSelectionError}
                </div>
            )}
            <IntegrationCardGrid>
                {migrationTools.map((tool) => {
                    return (
                        <ButtonCard
                            key={tool.id}
                            id={`${tool.id}-integration-card`}
                            icon={<Icon name="bi-import" />}
                            title={tool.title}
                            description=""
                            onClick={() => handleIntegrationSelection(tool)}
                            active={selectedIntegration?.id === tool.id}
                        />
                    );
                })}
            </IntegrationCardGrid>

            {selectedIntegration && (
                <StepContainer>
                    <Typography variant="h3" sx={{ marginBottom: 8 }}>Select a Project Folder or Directory</Typography>
                    <BodyText>{getSourceDescription(selectedIntegration)}</BodyText>
                    <DirectorySelector
                        id="import-project-folder-selector"
                        placeholder="Enter path or browse to select your folder..."
                        selectedPath={importSourcePath}
                        onSelect={handleFolderSelection}
                        onChange={(value) => {
                            setImportSourcePath(value);
                            setSourcePathError(null);
                            // Detect directory from typed path: no extension in the last segment
                            const lastSegment = value.split(/[/\\]/).pop() ?? "";
                            setIsDirectorySelected(!lastSegment.includes("."));
                        }}
                        errorMsg={sourcePathError || undefined}
                    />
                </StepContainer>
            )}

            {boolParam && isDirectorySelected && (
                <StepContainer>
                    <Typography variant="h3" sx={{ marginBottom: 4 }}>Source Layout</Typography>
                    <BodyText>Specify whether your source path contains a single project or multiple projects.</BodyText>
                    <RadioGroup role="radiogroup" aria-label="Source Layout" style={{ marginTop: 12 }}>
                        <RadioOption
                            selected={!getBoolValue(boolParam.key)}
                            onClick={() => handleParameterChange(boolParam.key, false)}
                        >
                            <RadioInput
                                type="radio"
                                name={boolParam.key}
                                checked={!getBoolValue(boolParam.key)}
                                onChange={() => handleParameterChange(boolParam.key, false)}
                            />
                            <RadioContent>
                                <RadioTitle>Single Project</RadioTitle>
                                <RadioDescription>The source path points to a single project directory.</RadioDescription>
                            </RadioContent>
                        </RadioOption>
                        <RadioOption
                            selected={getBoolValue(boolParam.key)}
                            onClick={() => handleParameterChange(boolParam.key, true)}
                        >
                            <RadioInput
                                type="radio"
                                name={boolParam.key}
                                checked={getBoolValue(boolParam.key)}
                                onChange={() => handleParameterChange(boolParam.key, true)}
                            />
                            <RadioContent>
                                <RadioTitle>Multiple Projects</RadioTitle>
                                <RadioDescription>The source path points to a directory containing one or more project directories.</RadioDescription>
                            </RadioContent>
                        </RadioOption>
                    </RadioGroup>
                </StepContainer>
            )}

            {!selectedIntegration && (
                <PathText>
                    <div style={{ color: "var(--vscode-editor-foreground)" }}>{SELECTION_TEXT}</div>
                </PathText>
            )}

            {selectedIntegration && (
                <IntegrationParameters
                    selectedIntegration={selectedIntegration}
                    integrationParams={integrationParams}
                    onParameterChange={handleParameterChange}
                />
            )}

            <ButtonWrapper>
                <ActionButtons
                    primaryButton={{
                        text: "Generate Report",
                        onClick: handleImportIntegration,
                        disabled: isImportDisabled
                    }}
                    secondaryButton={{
                        text: "Back",
                        onClick: onBack,
                        disabled: false
                    }}
                />
            </ButtonWrapper>

            {pullingTool && (
                <LoadingOverlayContainer>
                    <DownloadProgress
                        message={toolPullProgress?.message || "Pulling integration tool..."}
                        percentage={toolPullProgress?.percentage}
                    />
                </LoadingOverlayContainer>
            )}
        </>
    );
}
