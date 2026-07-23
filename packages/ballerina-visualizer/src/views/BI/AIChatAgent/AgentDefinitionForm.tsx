/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
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

import { useEffect, useState } from "react";
import styled from "@emotion/styled";
import { DIRECTORY_MAP, EVENT_TYPE, isSamePath, MACHINE_VIEW, ProjectStructureArtifactResponse } from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { Button, Codicon, TextField, Typography } from "@wso2/ui-toolkit";
import { IntroText } from "./AddAgentPopup/styles";
import {
    ProjectTypeContainer,
    ProjectTypeLabel,
    RadioContent,
    RadioDescription,
    RadioGroup,
    RadioInput,
    RadioOption,
    RadioTitle,
} from "../ProjectForm/styles";
import { sanitizeOrgHandle, toPascalCase, toSnakeCasePackageName, validateComponentName, validateOrgName, validatePackageName } from "../ProjectForm/utils";

type DefinitionDestination = "library" | "current";

const FormLayout = styled.div`
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow: hidden;
`;

const FormFields = styled.div`
    display: flex;
    flex: 1;
    min-height: 0;
    flex-direction: column;
    gap: 16px;
    overflow-y: auto;
    padding: 24px 36px 16px;
`;

const Actions = styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
    box-sizing: border-box;
    flex-shrink: 0;
    width: 100%;
    padding: 16px 36px;
    background: var(--vscode-editor-background);
    border-top: 1px solid var(--vscode-panel-border);
    z-index: 10;
`;

const SubmitButton = styled(Button)`
    width: 100% !important;
    min-width: 0 !important;
    display: flex !important;
    justify-content: center;
    align-items: center;
`;

const NameField = styled.div`
    display: flex;
    flex-direction: column;
    gap: 4px;
`;

const NameHint = styled.div`
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
`;

const LibraryDetails = styled.div`
    display: flex;
    flex-direction: column;
    gap: 16px;
`;

const PackageSettings = styled.div`
    border-top: 1px solid var(--vscode-panel-border);
    padding-top: 12px;
`;

const PackageSettingsButton = styled.button`
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0;
    color: var(--vscode-foreground);
    background: none;
    border: 0;
    cursor: pointer;
    font: inherit;
    font-size: 13px;
    font-weight: 600;
`;

const PackageSettingsContent = styled.div`
    display: flex;
    flex-direction: column;
    gap: 16px;
    margin-top: 16px;
`;

interface AgentDefinitionFormProps {
    projectPath: string;
    submitText?: string;
    onCreated?: () => void;
}

interface LibraryFormData {
    name: string;
    packageName: string;
    orgName: string;
    version: string;
}

type ValidatedLibraryField = "name" | "packageName" | "orgName";

type TouchedLibraryFields = Record<ValidatedLibraryField, boolean>;

interface LibraryDetailsFormProps {
    data: LibraryFormData;
    onChange: (changes: Partial<LibraryFormData>) => void;
    onPackageNameTouched: () => void;
    onFieldTouched: (field: ValidatedLibraryField) => void;
    isOrgLocked: boolean;
    touchedFields: TouchedLibraryFields;
    hasAttemptedSubmit: boolean;
}

function LibraryDetailsForm({
    data,
    onChange,
    onPackageNameTouched,
    onFieldTouched,
    isOrgLocked,
    touchedFields,
    hasAttemptedSubmit,
}: LibraryDetailsFormProps) {
    const [showPackageSettings, setShowPackageSettings] = useState(false);
    const libraryNameError = validateComponentName(data.name, true);
    const packageNameError = validatePackageName(data.packageName, data.name);
    const orgNameError = validateOrgName(data.orgName);
    const visibleError = (error: string | null, field: ValidatedLibraryField) =>
        touchedFields[field] || hasAttemptedSubmit ? error || "" : "";

    return (
        <LibraryDetails>
            <TextField
                label="Library Name"
                required
                placeholder="Meeting Notes Agent"
                description="The reusable library package created in this workspace."
                value={data.name}
                errorMsg={visibleError(libraryNameError, "name")}
                onTextChange={(name) => {
                    onFieldTouched("name");
                    onChange({ name });
                }}
                onBlur={() => onFieldTouched("name")}
                sx={{ width: "100%" }}
            />
            <PackageSettings>
                <PackageSettingsButton type="button" onClick={() => setShowPackageSettings((current) => !current)}>
                    <Codicon name="settings-gear" iconSx={{ fontSize: 14 }} />
                    Package settings (optional)
                    <Codicon name={showPackageSettings ? "chevron-up" : "chevron-down"} iconSx={{ fontSize: 14 }} />
                </PackageSettingsButton>
                {showPackageSettings && (
                    <PackageSettingsContent>
                        <TextField
                            label="Package Name"
                            required
                            description="Specify the package name."
                            value={data.packageName}
                            errorMsg={visibleError(packageNameError, "packageName")}
                            onTextChange={(packageName) => {
                                onFieldTouched("packageName");
                                onPackageNameTouched();
                                onChange({ packageName });
                            }}
                            onBlur={() => onFieldTouched("packageName")}
                            sx={{ width: "100%" }}
                        />
                        <TextField
                            label="Organization"
                            required
                            description="The organization that owns this package."
                            value={data.orgName}
                            disabled={isOrgLocked}
                            errorMsg={visibleError(orgNameError, "orgName")}
                            onTextChange={(orgName) => {
                                onFieldTouched("orgName");
                                onChange({ orgName });
                            }}
                            onBlur={() => onFieldTouched("orgName")}
                            sx={{ width: "100%" }}
                        />
                        <TextField
                            label="Package Version"
                            placeholder="0.1.0"
                            description="Version of the package."
                            value={data.version}
                            onTextChange={(version) => onChange({ version })}
                            sx={{ width: "100%" }}
                        />
                    </PackageSettingsContent>
                )}
            </PackageSettings>
        </LibraryDetails>
    );
}

export function AgentDefinitionForm({ projectPath, submitText = "Create Agent Definition", onCreated }: AgentDefinitionFormProps) {
    const { rpcClient } = useRpcContext();
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [destination, setDestination] = useState<DefinitionDestination>("current");
    const [canCreateLibrary, setCanCreateLibrary] = useState(false);
    const [creating, setCreating] = useState(false);
    const [nameTouched, setNameTouched] = useState(false);
    const [libraryNameEdited, setLibraryNameEdited] = useState(false);
    const [libraryPackageNameTouched, setLibraryPackageNameTouched] = useState(false);
    const [libraryFieldTouched, setLibraryFieldTouched] = useState<TouchedLibraryFields>({
        name: false,
        packageName: false,
        orgName: false,
    });
    const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
    const [isLibraryOrgLocked, setIsLibraryOrgLocked] = useState(false);
    const [library, setLibrary] = useState<LibraryFormData>({
        name: "",
        packageName: "",
        orgName: "",
        version: "",
    });

    const normalizedName = toPascalCase(name);
    const isValidName = normalizedName.length > 0;

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const [workspaceType, structure] = await Promise.all([
                    rpcClient.getCommonRpcClient().getWorkspaceType(),
                    rpcClient.getBIDiagramRpcClient().getProjectStructure(),
                ]);
                const activeProject = structure.projects.find((project) => isSamePath(project.projectPath, projectPath));
                const eligible = workspaceType.type === "BALLERINA_WORKSPACE" && !!activeProject && !activeProject.isLibrary;
                if (!cancelled) {
                    setCanCreateLibrary(eligible);
                    setDestination(eligible ? "library" : "current");
                }
            } catch {
                if (!cancelled) {
                    setCanCreateLibrary(false);
                    setDestination("current");
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [projectPath, rpcClient]);

    const handleNameChange = (value: string) => {
        setName(value);
        setNameTouched(true);
        if (!libraryNameEdited) {
            setLibrary((current) => ({
                ...current,
                name: value,
                packageName: libraryPackageNameTouched ? current.packageName : toSnakeCasePackageName(value),
            }));
        }
    };

    const handleLibraryChange = (changes: Partial<LibraryFormData>) => {
        if (changes.name !== undefined) {
            setLibraryNameEdited(true);
        }
        setLibrary((current) => ({ ...current, ...changes }));
    };

    const handleLibraryFieldTouched = (field: ValidatedLibraryField) => {
        setLibraryFieldTouched((current) => current[field] ? current : { ...current, [field]: true });
    };

    useEffect(() => {
        let cancelled = false;
        rpcClient.getCommonRpcClient().getDefaultOrgName().then(({ orgName, isLocked }) => {
            if (!cancelled) {
                setLibrary((current) => current.orgName ? current : { ...current, orgName });
                setIsLibraryOrgLocked(isLocked);
            }
        }).catch(() => {
        });
        return () => {
            cancelled = true;
        };
    }, [rpcClient]);

    const isLibraryFormValid =
        validateComponentName(library.name, true) === null &&
        validatePackageName(library.packageName, library.name) === null &&
        validateOrgName(library.orgName) === null;

    const openDefinition = async (
        artifacts: ProjectStructureArtifactResponse[] | undefined,
        definitionProjectPath: string,
        definitionName: string
    ) => {
        const artifact = artifacts?.find((item) => item.name === definitionName) ?? artifacts?.[0];
        if (!artifact?.path) {
            return;
        }
        await rpcClient.getVisualizerRpcClient().openView({
            type: EVENT_TYPE.OPEN_VIEW,
            location: {
                documentUri: artifact.path,
                position: artifact.position,
                identifier: definitionName,
                projectPath: definitionProjectPath,
                artifactType: DIRECTORY_MAP.AGENT_DEFINITION,
                view: MACHINE_VIEW.AgentDefinitionDesigner,
            },
        });
    };

    const handleCreate = async () => {
        if (!isValidName || creating || (destination === "library" && !isLibraryFormValid)) {
            setHasAttemptedSubmit(true);
            return;
        }

        setCreating(true);
        try {
            if (destination === "library") {
                await rpcClient.getAIAgentRpcClient().createLibraryAgentDefinition({
                    sourceProjectPath: projectPath,
                    name: normalizedName,
                    description: description.trim(),
                    libraryName: library.name,
                    packageName: library.packageName,
                    orgName: library.orgName || undefined,
                    orgHandle: sanitizeOrgHandle(library.orgName),
                    version: library.version || undefined,
                });
            } else {
                const { filePath } = await rpcClient
                    .getVisualizerRpcClient()
                    .joinProjectPath({ segments: ["Ballerina.toml"] });
                const response = await rpcClient.getAIAgentRpcClient().genAgentDefinition({
                    filePath,
                    name: normalizedName,
                    description: description.trim(),
                });
                await openDefinition(response.artifacts, projectPath, normalizedName);
            }
            onCreated?.();
        } catch {
        } finally {
            setCreating(false);
        }
    };

    const nameError = !nameTouched && !hasAttemptedSubmit
        ? ""
        : name.trim().length === 0
            ? "Name is required"
            : !isValidName
                ? "Name must contain at least one letter"
                : "";
    const showNamePreview = isValidName && normalizedName !== name.trim();

    return (
        <FormLayout>
            <FormFields>
                <IntroText>
                    Create a reusable agent template that you can share with others and instantiate across projects.
                </IntroText>
                <NameField>
                    <TextField
                        label="Name"
                        required
                        placeholder="e.g., CustomerSupportAgent"
                        description="A unique name for the agent definition"
                        value={name}
                        errorMsg={nameError}
                        onTextChange={handleNameChange}
                        onBlur={() => setNameTouched(true)}
                        sx={{ width: "100%" }}
                    />
                    {showNamePreview && (
                        <NameHint>
                            Will be created as: <strong>{normalizedName}</strong>
                        </NameHint>
                    )}
                </NameField>
                <TextField
                    label="Description"
                    placeholder="e.g., An agent that provides customer support."
                    description="A brief description of what this agent does. Shown in the library catalog."
                    value={description}
                    onTextChange={setDescription}
                    sx={{ width: "100%" }}
                />
                {canCreateLibrary && (
                    <ProjectTypeContainer>
                        <ProjectTypeLabel>Create this definition in</ProjectTypeLabel>
                        <RadioGroup>
                            <RadioOption isSelected={destination === "library"}>
                                <RadioInput
                                    type="radio"
                                    name="agentDefinitionDestination"
                                    checked={destination === "library"}
                                    onChange={() => setDestination("library")}
                                />
                                <RadioContent>
                                    <RadioTitle>New library package (Recommended)</RadioTitle>
                                    <RadioDescription>Create a reusable, publishable library package in this workspace.</RadioDescription>
                                </RadioContent>
                            </RadioOption>
                            <RadioOption isSelected={destination === "current"}>
                                <RadioInput
                                    type="radio"
                                    name="agentDefinitionDestination"
                                    checked={destination === "current"}
                                    onChange={() => setDestination("current")}
                                />
                                <RadioContent>
                                    <RadioTitle>Current integration</RadioTitle>
                                    <RadioDescription>Keep this definition local to the current integration.</RadioDescription>
                                </RadioContent>
                            </RadioOption>
                        </RadioGroup>
                    </ProjectTypeContainer>
                )}
                {canCreateLibrary && destination === "library" && (
                    <LibraryDetailsForm
                        data={library}
                        onChange={handleLibraryChange}
                        onPackageNameTouched={() => setLibraryPackageNameTouched(true)}
                        onFieldTouched={handleLibraryFieldTouched}
                        isOrgLocked={isLibraryOrgLocked}
                        touchedFields={libraryFieldTouched}
                        hasAttemptedSubmit={hasAttemptedSubmit}
                    />
                )}
            </FormFields>
            <Actions>
                <SubmitButton
                    appearance="primary"
                    disabled={creating}
                    onClick={handleCreate}
                    sx={{ width: "100%" }}
                    buttonSx={{ width: "100%", height: "35px" }}
                >
                    {creating ? <Typography variant="progress">Creating...</Typography> : submitText}
                </SubmitButton>
            </Actions>
        </FormLayout>
    );
}

export default AgentDefinitionForm;
