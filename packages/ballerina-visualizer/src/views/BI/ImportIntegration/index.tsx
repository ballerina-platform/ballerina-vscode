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

import {
    DownloadProgress,
    ImportIntegrationResponse,
    ImportIntegrationRPCRequest,
    MigrateRequest,
    MigrationTool,
    ProjectMigrationResult,
    ProjectRequest,
} from "@wso2/ballerina-core";
import { useBiWsContext } from "../wsManager/WsClientContext";
import { Icon, Typography } from "@wso2/ui-toolkit";
import { Stepper, StepperContainer } from "@wso2/ui-toolkit/lib/components/Stepper/Stepper";
import { useEffect, useRef, useState } from "react";
import { ConfigureProjectForm } from "./ConfigureProjectForm";
import { DryRunView } from "./DryRunView";
import { ImportIntegrationForm } from "./ImportIntegrationForm";
import { MigrationProgressView } from "./MigrationProgressView";
import { WizardAIEnhancementView } from "./WizardAIEnhancementView";
import {
    ContentPanel,
    FormContainer,
    FormPanelHeader,
    HeaderRow,
    HeaderSubtitle,
    HeaderText,
    IconButton,
    PageBackdrop,
    PageContainer,
    StepperWrapper,
} from "./styles";
import { FinalIntegrationParams } from "./types";

export function ImportIntegration() {
    const { wsClient, onBack } = useBiWsContext();

    // State managed by the parent component
    const [step, setStep] = useState(0);
    const [toolPullProgress, setToolPullProgress] = useState<DownloadProgress | null>(null);
    const [migrationToolState, setMigrationToolState] = useState<string | null>(null);
    const [migrationToolLogs, setMigrationToolLogs] = useState<string[]>([]);
    const [migratedProjects, setMigratedProjects] = useState<ProjectMigrationResult[]>([]);
    const [pullingTool, setPullingTool] = useState(false);
    const [toolPullFailed, setToolPullFailed] = useState(false);
    const [toolPullFailureMessage, setToolPullFailureMessage] = useState<string | null>(null);
    const [selectedIntegration, setSelectedIntegration] = useState<MigrationTool | null>(null);
    const [migrationTools, setMigrationTools] = useState<MigrationTool[]>([]);
    const [importParams, setImportParams] = useState<FinalIntegrationParams | null>(null);
    const [migrationCompleted, setMigrationCompleted] = useState(false);
    const [migrationSuccessful, setMigrationSuccessful] = useState(false);
    const [migrationResponse, setMigrationResponse] = useState<ImportIntegrationResponse | null>(null);
    const [storedProjectRequest, setStoredProjectRequest] = useState<ProjectRequest | null>(null);
    const migrationStartedRef = useRef(false);

    // Dry-run state (step 1)
    const [dryRunToolState, setDryRunToolState] = useState<string | null>(null);
    const [dryRunLogs, setDryRunLogs] = useState<string[]>([]);
    const [dryRunCompleted, setDryRunCompleted] = useState(false);
    const [dryRunSuccessful, setDryRunSuccessful] = useState(false);
    const [dryRunResponse, setDryRunResponse] = useState<ImportIntegrationResponse | null>(null);
    const [dryRunProjects, setDryRunProjects] = useState<ProjectMigrationResult[]>([]);
    const dryRunStartedRef = useRef(false);
    // Routes migration tool events to the correct run's state
    const activeRunRef = useRef<"dryRun" | "migration" | null>(null);

    const steps = ["Configure Source", "Report Generation", "Configure Destination", "Rule-Based Migration", "AI Enhancement"];

    // isMultiProject for ConfigureProjectForm is derived from the source config (step 0 selection)
    const boolParamKey = selectedIntegration?.parameters.find(p => p.valueType === "boolean")?.key;
    const isMultiProjectFromConfig = boolParamKey ? importParams?.parameters?.[boolParamKey] === true : false;
    // isMultiProject for MigrationProgressView is derived from actual migration results
    const isMultiProject = migratedProjects.length > 0;

    const pullIntegrationTool = (commandName: string, version: string) => {
        setPullingTool(true);
        wsClient.pullMigrationTool({
            toolName: commandName,
            version: version,
        });
    };

    // Runs the dry-run CLI migration (importIntegration with dryRun: true).
    const handleStartDryRun = async (
        params: FinalIntegrationParams,
        integration: MigrationTool,
    ) => {
        activeRunRef.current = "dryRun";
        const rpcParams: ImportIntegrationRPCRequest = {
            packageName: "",
            commandName: integration.commandName,
            sourcePath: params.importSourcePath,
            parameters: { ...params.parameters, dryRun: true },
        };
        try {
            const response = await wsClient.importIntegration(rpcParams);
            setDryRunCompleted(true);
            setDryRunResponse(response);
            if (!response.error) {
                setDryRunSuccessful(true);
            }
        } catch (error) {
            console.error("Error during dry run:", error);
            setDryRunCompleted(true);
            setDryRunSuccessful(false);
            setDryRunResponse({ error: error instanceof Error ? error.message : String(error), textEdits: {}, report: '', jsonReport: '' });
        }
    };

    // Runs the static CLI migration (importIntegration) and stores the report.
    // migrateProject (file writing + folder open) is deferred to the user's choice at step 3.
    const handleStartImport = async (
        params: FinalIntegrationParams,
        integration: MigrationTool,
    ) => {
        activeRunRef.current = "migration";
        console.log("Starting import with params:", params);

        const rpcParams: ImportIntegrationRPCRequest = {
            packageName: "",
            commandName: integration.commandName,
            sourcePath: params.importSourcePath,
            parameters: params.parameters,
        };
        try {
            const response = await wsClient.importIntegration(rpcParams);
            setMigrationCompleted(true);
            setMigrationResponse(response);
            if (!response.error) {
                setMigrationSuccessful(true);
            }
        } catch (error) {
            console.error("Error during migration:", error);
            setMigrationCompleted(true);
            setMigrationSuccessful(false);
            setMigrationResponse({ error: error instanceof Error ? error.message : String(error), textEdits: {}, report: '', jsonReport: '' });
        }
    };

    const handleConfigureDestinationDone = (project: ProjectRequest, _aiFeatureUsed: boolean) => {
        if (!importParams || !selectedIntegration) return;
        setStoredProjectRequest(project);
        // Advance to migration step; import starts automatically when step 3 renders.
        setStep(3);
    };

    const handleStepBack = () => {
        if (step === 1) {
            // Back from dry run → reset pull failure so user can retry
            setToolPullFailed(false);
            setToolPullFailureMessage(null);
            setToolPullProgress(null);
            setPullingTool(false);
            dryRunStartedRef.current = false;
            setDryRunToolState(null);
            setDryRunLogs([]);
            setDryRunCompleted(false);
            setDryRunSuccessful(false);
            setDryRunResponse(null);
            setDryRunProjects([]);
            activeRunRef.current = null;
        }
        if (step === 3) {
            // Back from rule-based migration → reset migration state and pull failure.
            // NOTE: keep `toolPullProgress` — the tool was already pulled at step 0→1, and
            // the step-3 auto-start effect gates on `toolPullProgress?.success === true`.
            // Nulling it here would leave migration unable to restart on re-entry.
            migrationStartedRef.current = false;
            setMigrationToolState(null);
            setMigrationToolLogs([]);
            setMigrationCompleted(false);
            setMigrationSuccessful(false);
            setMigrationResponse(null);
            setMigratedProjects([]);
            setToolPullFailed(false);
            setToolPullFailureMessage(null);
            activeRunRef.current = null;
        }
        setStep(step - 1);
    };

    const handleAIEnhancement = async () => {
        if (!importParams || !storedProjectRequest || !migrationResponse) return;
        const params: MigrateRequest = {
            project: storedProjectRequest,
            textEdits: migrationResponse.textEdits,
            projects: migratedProjects,
            aiFeatureUsed: true,
            sourcePath: importParams.importSourcePath,
            keepStructure: importParams?.parameters?.["keepStructure"] as boolean | undefined,
        };
        // Await the project write before advancing: the enhancement step calls
        // wizardEnhancementReady, which needs the project root migrateProject sets.
        // Advancing early would both race that and hide a write failure.
        try {
            await wsClient.migrateProject(params);
            setStep(4);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error("Failed to start migration:", error);
            wsClient.showErrorMessage({ message: `Failed to start AI enhancement: ${message}` });
        }
    };

    const handleOpenProject = async () => {
        if (!importParams || !storedProjectRequest || !migrationResponse) return;
        // aiFeatureUsed: false → extension calls vscode.openFolder immediately (VS Code reloads)
        const params: MigrateRequest = {
            project: storedProjectRequest,
            textEdits: migrationResponse.textEdits,
            projects: migratedProjects,
            aiFeatureUsed: false,
            sourcePath: importParams.importSourcePath,
            keepStructure: importParams?.parameters?.["keepStructure"] as boolean | undefined,
        };
        // Fire-and-forget: the extension opens the folder (VS Code reloads). Guard the
        // promise and surface any failure to the user rather than only logging it.
        wsClient.migrateProject(params).catch((error) => {
            const message = error instanceof Error ? error.message : String(error);
            console.error("Failed to open migrated project:", error);
            wsClient.showErrorMessage({ message: `Failed to open the migrated project: ${message}` });
        });
    };

    const handleDone = async () => {
        if (!importParams || !storedProjectRequest || !migrationResponse) return;
        // aiFeatureUsed: true → project created but folder not opened; user can enhance later
        const params: MigrateRequest = {
            project: storedProjectRequest,
            textEdits: migrationResponse.textEdits,
            projects: migratedProjects,
            aiFeatureUsed: true,
            sourcePath: importParams.importSourcePath,
            keepStructure: importParams?.parameters?.["keepStructure"] as boolean | undefined,
        };
        // Await the project write before navigating away, so a failure keeps the user
        // on the wizard with a visible error instead of silently returning to welcome.
        try {
            await wsClient.migrateProject(params);
            gotToWelcome();
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error("Failed to finalize migration:", error);
            wsClient.showErrorMessage({ message: `Failed to finalize migration: ${message}` });
        }
    };

    const gotToWelcome = () => {
        onBack();
    };

    const getMigrationTools = () => {
        wsClient
            .getMigrationTools()
            .then((response) => {
                console.log("Available migration tools:", response.tools);
                setMigrationTools(response.tools);
            });
    };

    useEffect(() => {
        getMigrationTools();

        const unsubscribers = [
            wsClient.onDownloadProgress((progressUpdate) => {
                setToolPullProgress(progressUpdate);
                if (progressUpdate.success) {
                    setPullingTool(false);
                }

                if (progressUpdate.step === -1) {
                    setPullingTool(false);
                    setToolPullFailed(true);
                    setToolPullFailureMessage(progressUpdate.message);
                    wsClient.showErrorMessage({ message: progressUpdate.message });
                }
            }),

            wsClient.onMigrationToolStateChanged((state) => {
                const activeRun = activeRunRef.current;
                if (activeRun === "dryRun") {
                    setDryRunToolState(state);
                } else if (activeRun === "migration") {
                    setMigrationToolState(state);
                }
            }),

            wsClient.onMigrationToolLogs((log) => {
                const activeRun = activeRunRef.current;
                if (activeRun === "dryRun") {
                    setDryRunLogs((prevLogs) => [...prevLogs, log]);
                } else if (activeRun === "migration") {
                    setMigrationToolLogs((prevLogs) => [...prevLogs, log]);
                }
            }),

            wsClient.onMigratedProject((project) => {
                const activeRun = activeRunRef.current;
                if (activeRun === "dryRun") {
                    setDryRunProjects((prevProjects) => [...prevProjects, project]);
                } else if (activeRun === "migration") {
                    setMigratedProjects((prevProjects) => [...prevProjects, project]);
                }
            }),
        ];

        return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
    }, [wsClient]);

    useEffect(() => {
        // Start the dry run when step 1 is reached and the tool pull has succeeded.
        // dryRunStartedRef prevents a double-start if multiple deps fire simultaneously.
        if (
            step === 1 &&
            !dryRunStartedRef.current &&
            !toolPullFailed &&
            importParams &&
            selectedIntegration &&
            toolPullProgress?.success === true
        ) {
            dryRunStartedRef.current = true;
            handleStartDryRun(importParams, selectedIntegration);
        }
    }, [step, toolPullFailed, toolPullProgress?.success]);

    useEffect(() => {
        // Start the rule-based migration when step 3 is reached and the tool pull has succeeded.
        // migrationStartedRef prevents a double-start if multiple deps fire simultaneously.
        if (
            step === 3 &&
            !migrationStartedRef.current &&
            !toolPullFailed &&
            importParams &&
            selectedIntegration &&
            storedProjectRequest &&
            toolPullProgress?.success === true
        ) {
            migrationStartedRef.current = true;
            handleStartImport(importParams, selectedIntegration);
        }
    }, [step, toolPullFailed, toolPullProgress?.success, storedProjectRequest]);

    return (
        <PageBackdrop>
            <PageContainer>
                <ContentPanel>
                    <FormPanelHeader>
                        <HeaderRow>
                            <IconButton type="button" onClick={gotToWelcome} title="Go back">
                                <Icon
                                    name="arrow-left"
                                    isCodicon
                                    sx={{ width: "16px", height: "16px", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                                    iconSx={{ color: "var(--vscode-foreground)", fontSize: "16px", lineHeight: 1 }}
                                />
                            </IconButton>
                            <HeaderText>
                                <Typography variant="h2" sx={{ margin: 0, fontWeight: 600 }}>
                                    Migrate External Integration
                                </Typography>
                                <HeaderSubtitle>
                                    Convert your MuleSoft or TIBCO projects into new WSO2 Integrator projects.
                                </HeaderSubtitle>
                            </HeaderText>
                        </HeaderRow>
                    </FormPanelHeader>
                    <FormContainer>
                        <StepperWrapper>
                            <StepperContainer>
                                <Stepper alignment="flex-start" steps={steps} currentStep={step} />
                            </StepperContainer>
                        </StepperWrapper>
                        {step === 0 && (
                            <ImportIntegrationForm
                                selectedIntegration={selectedIntegration}
                                migrationTools={migrationTools}
                                setImportParams={setImportParams}
                                pullIntegrationTool={pullIntegrationTool}
                                pullingTool={pullingTool}
                                toolPullProgress={toolPullProgress}
                                onSelectIntegration={setSelectedIntegration}
                                onNext={() => setStep(1)}
                                onBack={gotToWelcome}
                            />
                        )}
                        {step === 1 && (
                            <DryRunView
                                migrationState={dryRunToolState}
                                migrationLogs={dryRunLogs}
                                migrationCompleted={dryRunCompleted}
                                migrationSuccessful={dryRunSuccessful}
                                migrationResponse={dryRunResponse}
                                projects={dryRunProjects}
                                isMultiProject={dryRunProjects.length > 0}
                                onNext={() => setStep(2)}
                                onDone={gotToWelcome}
                                toolPullFailed={toolPullFailed}
                                toolPullFailureMessage={toolPullFailureMessage}
                                migrationToolCommandName={selectedIntegration?.commandName}
                                onBack={handleStepBack}
                            />
                        )}
                        {step === 2 && (
                            <ConfigureProjectForm
                                isMultiProject={isMultiProjectFromConfig}
                                importSourcePath={importParams?.importSourcePath}
                                onNext={handleConfigureDestinationDone}
                                onBack={handleStepBack}
                            />
                        )}
                        {step === 3 && (
                            <MigrationProgressView
                                migrationState={migrationToolState}
                                migrationLogs={migrationToolLogs}
                                migrationCompleted={migrationCompleted}
                                migrationSuccessful={migrationSuccessful}
                                migrationResponse={migrationResponse}
                                projects={migratedProjects}
                                isMultiProject={isMultiProject}
                                onStartAIEnhancement={handleAIEnhancement}
                                onDone={handleDone}
                                onOpenProject={handleOpenProject}
                                onBack={handleStepBack}
                                toolPullFailed={toolPullFailed}
                                toolPullFailureMessage={toolPullFailureMessage}
                                migrationToolCommandName={selectedIntegration?.commandName}
                            />
                        )}
                        {step === 4 && (
                            <WizardAIEnhancementView
                                projectCount={migratedProjects.length}
                                isMultiProject={isMultiProject}
                                onFinish={gotToWelcome}
                            />
                        )}
                    </FormContainer>
                </ContentPanel>
            </PageContainer>
        </PageBackdrop>
    );
}
