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

import { lazy, MouseEvent, Suspense, useEffect, useState } from "react";
import styled from "@emotion/styled";
import { EVENT_TYPE, EvalsetItem, Evaluation, EvaluationFileResponse, MACHINE_VIEW } from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { Button, Codicon, Menu, MenuItem, Popover, ProgressRing, ThemeColors, Typography } from "@wso2/ui-toolkit";
import { PopupModal, PopupModalStep, PopupModalStepDirection } from "../../../components/PopupModal";
import { RelativeLoader } from "../../../components/RelativeLoader";
import {
    BackButton,
    CloseButton,
    HeaderTitleContainer,
    PopupContent,
    PopupFooter,
    PopupHeader,
    PopupSubtitle,
    PopupTitle,
} from "../Connection/styles";
import { EvaluationRunStatus, useAgentEvaluations } from "./useAgentEvaluations";
import { Badge, TemplateSearch } from "../AIEvaluationForm/styles";
import { formatTemplateKind, templateIconFor } from "../AIEvaluationForm/templateUtils";
import { resolveEvalsetPath } from "../AIEvaluationForm/evalsetUtils";

const AIEvaluationFormBody = lazy(() =>
    import("../AIEvaluationForm").then((module) => ({ default: module.AIEvaluationFormBody })));

const POPUP_MAX_WIDTH = 720;
const GALLERY_MAX_WIDTH = 1000;
const LIST_HEIGHT = "min(560px, 95vh)";

type Step = "list" | "templates" | "create" | "edit";

interface MenuAction {
    id: string;
    label: string;
    icon: string;
    disabled?: boolean;
    onSelect: () => void;
}

const searchText = (evaluation: Evaluation, evalset?: EvalsetItem) => [
    evaluation.functionName,
    evaluation.template?.label,
    evaluation.template ? formatTemplateKind(evaluation.template.kind) : "Custom",
    evalset?.name,
].join(" ").toLowerCase();

const threadLabel = (count: number) => `${count} thread${count === 1 ? "" : "s"}`;

const isControlClick = (event: MouseEvent<HTMLElement>) =>
    Boolean((event.target as HTMLElement).closest("button, vscode-button"));

const SearchBar = styled.div`
    padding: 12px 20px 0;
`;

// Negative margin lets the hover highlight extend past the text while icons line up with the search box.
const List = styled.div`
    display: flex;
    flex-direction: column;
    margin: 0 -8px;
`;

const Row = styled.div`
    position: relative;
    display: grid;
    grid-template-columns: 16px minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    padding: 12px 8px;
    border-radius: 4px;
    cursor: pointer;
    &:hover {
        background: var(--vscode-list-hoverBackground);
    }
    & + &::before {
        content: "";
        position: absolute;
        top: 0;
        left: 8px;
        right: 8px;
        border-top: 1px solid var(--vscode-panel-border);
    }
`;

const RowIcon = styled.div`
    align-self: start;
    display: flex;
    margin-top: 2px;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
`;

const RowText = styled.div`
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
`;

const RowName = styled(Typography)`
    margin: 0;
    font-weight: 600;
    color: ${ThemeColors.ON_SURFACE};
`;

const RowTags = styled.div`
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin-top: 6px;
`;

const EvalsetLink = styled.button`
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-left: 4px;
    padding: 0;
    border: none;
    background: none;
    font: inherit;
    font-size: 12px;
    color: var(--vscode-textLink-foreground);
    cursor: pointer;
    &:hover {
        color: var(--vscode-textLink-activeForeground);
        text-decoration: underline;
    }
`;

const EvalsetMissing = styled.span`
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-left: 4px;
    font-size: 12px;
    color: var(--vscode-editorWarning-foreground);
`;

const RowActions = styled.div`
    display: flex;
    align-items: center;
    gap: 2px;
`;

const MenuLabel = styled.span`
    display: flex;
    align-items: center;
    gap: 8px;
`;

const StatusLabel = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
`;

const EmptyState = styled.div`
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
`;

const Message = styled(Typography)`
    margin: 0;
    text-align: center;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
`;

const EmptyText = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    max-width: 420px;
`;

const EmptyTitle = styled(Typography)`
    margin: 0;
    text-align: center;
    font-weight: 600;
    color: ${ThemeColors.ON_SURFACE};
`;

const ErrorMessage = styled(Typography)`
    margin: 0;
    color: ${ThemeColors.ERROR};
`;

const HeaderActions = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
`;

interface RowActionProps {
    status?: EvaluationRunStatus;
    isBusy: boolean;
    onRun: () => void;
    onStop: () => void;
}

function RowAction({ status, isBusy, onRun, onStop }: RowActionProps) {
    if (status === "running") {
        return (
            <StatusLabel title="In the current run">
                <ProgressRing sx={{ width: 14, height: 14 }} />
                Running
                <Button appearance="icon" tooltip="Stop" onClick={onStop}>
                    <Codicon name="debug-stop" />
                </Button>
            </StatusLabel>
        );
    }
    if (status === "queued") {
        return (
            <StatusLabel title="Waits for the current run to finish">
                Queued
                <Button appearance="icon" tooltip="Remove from queue" onClick={onStop}>
                    <Codicon name="close" />
                </Button>
            </StatusLabel>
        );
    }
    if (status === "stopping") {
        return <StatusLabel title="Waiting for the run to stop">Stopping…</StatusLabel>;
    }
    return (
        <Button appearance="icon" tooltip={isBusy ? "Add to queue" : "Run"} onClick={onRun}>
            <Codicon name="play" />
        </Button>
    );
}

function MenuTrigger({ onOpen }: { onOpen: (anchor: HTMLElement) => void }) {
    return (
        <Button
            appearance="icon"
            tooltip="More actions"
            onClick={(event: MouseEvent<HTMLElement | SVGSVGElement>) => onOpen(event.currentTarget as HTMLElement)}
        >
            <Codicon name="kebab-vertical" />
        </Button>
    );
}

function EvalsetTag({ evalset, onOpen }: { evalset?: EvalsetItem; onOpen: (filePath: string) => void }) {
    if (!evalset) {
        return (
            <EvalsetMissing title="The evalset this evaluation loads was not found">
                <Codicon name="warning" iconSx={{ fontSize: 12 }} sx={{ height: 12 }} />
                Evalset missing
            </EvalsetMissing>
        );
    }
    return (
        <EvalsetLink type="button" title="Open evalset" onClick={() => onOpen(evalset.filePath)}>
            <Codicon name="collection" iconSx={{ fontSize: 12 }} sx={{ height: 12 }} />
            {evalset.name} · {threadLabel(evalset.threadCount)}
        </EvalsetLink>
    );
}

interface ListActionsProps {
    isBusy: boolean;
    canRunAll: boolean;
    onCreateEvaluation: () => void;
    onRunAll: () => void;
    onStopAll: () => void;
}

function ListActions({ isBusy, canRunAll, onCreateEvaluation, onRunAll, onStopAll }: ListActionsProps) {
    return (
        <>
            <Button appearance="primary" onClick={onCreateEvaluation}>
                <Codicon name="add" sx={{ marginRight: 4 }} />
                New evaluation
            </Button>
            {isBusy && (
                <Button appearance="secondary" onClick={onStopAll}>
                    <Codicon name="debug-stop" sx={{ marginRight: 4 }} />
                    Stop all
                </Button>
            )}
            {!isBusy && canRunAll && (
                <Button appearance="secondary" onClick={onRunAll}>
                    <Codicon name="play" sx={{ marginRight: 4 }} />
                    Run all
                </Button>
            )}
        </>
    );
}

interface NewEvaluationProps {
    projectPath: string;
    agentName: string;
    templatesOpen: boolean;
    onTemplatesOpenChange: (open: boolean) => void;
    onChoose: (title: string) => void;
    onSaved: () => void;
}

function NewEvaluation(props: NewEvaluationProps) {
    const { projectPath, agentName, templatesOpen, onTemplatesOpenChange, onChoose, onSaved } = props;
    const { rpcClient } = useRpcContext();
    const [file, setFile] = useState<EvaluationFileResponse>();

    useEffect(() => {
        let active = true;
        rpcClient.getTestManagerRpcClient().getEvaluationFile({ projectPath }).then((response) => {
            if (active) {
                setFile(response);
            }
        });
        return () => {
            active = false;
        };
    }, [rpcClient, projectPath]);

    if (!file?.filePath) {
        return (
            <PopupContent>
                {file ? <ErrorMessage variant="body2">{file.errorMsg}</ErrorMessage> : <RelativeLoader />}
            </PopupContent>
        );
    }
    return (
        <AIEvaluationFormBody
            projectPath={projectPath}
            filePath={file.filePath}
            serviceType="ADD_NEW_TEST"
            agentName={agentName}
            templatePicker={{ open: templatesOpen, onOpenChange: onTemplatesOpenChange, onChoose }}
            embedded
            onSaved={onSaved}
        />
    );
}

interface AgentEvaluationsPopupProps {
    projectPath: string;
    agentName: string;
    onClose: () => void;
}

export function AgentEvaluationsPopup({ projectPath, agentName, onClose }: AgentEvaluationsPopupProps) {
    const { rpcClient } = useRpcContext();
    const {
        evaluations, error, run, stop, statusOf, isBusy, reload, runAction, evalsetOf, openEvalset,
    } = useAgentEvaluations(projectPath, agentName);
    const [step, setStep] = useState<Step>("list");
    const [direction, setDirection] = useState<PopupModalStepDirection>("forward");
    const [choice, setChoice] = useState<string>();
    const [editing, setEditing] = useState<Evaluation>();
    const [query, setQuery] = useState("");
    const [menu, setMenu] = useState<{ anchor: HTMLElement; actions: MenuAction[] }>();
    const text = query.trim().toLowerCase();
    const isEmpty = !error && evaluations?.length === 0;
    const visibleEvaluations = evaluations?.filter((evaluation) =>
        searchText(evaluation, evalsetOf(evaluation)).includes(text));

    const goTo = (next: Step, to: PopupModalStepDirection) => {
        setDirection(to);
        setStep(next);
    };
    const createEvaluation = () => goTo("templates", "forward");
    const editEvaluation = (evaluation: Evaluation) => {
        setEditing(evaluation);
        goTo("edit", "forward");
    };
    // Gallery and form share one step and slide on their own, so only leaving the flow changes direction.
    const goBack = () => (step === "create" ? setStep("templates") : goTo("list", "backward"));
    const title = { list: "Evaluations", templates: "New evaluation", create: choice, edit: editing?.functionName }[step];
    const subtitle = {
        list: `Evaluations that run ${agentName}`,
        templates: `For ${agentName}`,
        create: `For ${agentName}`,
        edit: `Edit evaluation for ${agentName}`,
    }[step];
    const handleSaved = () => {
        reload();
        goTo("list", "backward");
    };

    const openHistory = () => rpcClient.getCommonRpcClient().executeCommand({
        commands: ["ballerina.openEvaluationHistory", projectPath]
    });

    const openEvalsets = () => rpcClient.getVisualizerRpcClient().openView({
        type: EVENT_TYPE.OPEN_VIEW,
        location: { view: MACHINE_VIEW.EvalsetList, projectPath }
    });

    const evaluationActions = (evaluation: Evaluation): MenuAction[] => {
        const { functionName } = evaluation;
        return [
            { id: "edit", label: "Edit", icon: "edit", onSelect: () => editEvaluation(evaluation) },
            { id: "openFlow", label: "Open flow diagram", icon: "type-hierarchy", onSelect: () => runAction(functionName, "openFlow") },
            {
                id: "delete", label: "Delete", icon: "trash", disabled: Boolean(statusOf(functionName)),
                onSelect: () => runAction(functionName, "delete"),
            },
        ];
    };

    const renderRow = (evaluation: Evaluation) => (
        <Row
            key={evaluation.functionName}
            title="Edit evaluation"
            onClick={(event) => !isControlClick(event) && editEvaluation(evaluation)}
        >
            <RowIcon>
                <Codicon name={evaluation.template
                    ? templateIconFor(evaluation.template.label, evaluation.template.kind)
                    : "code"} />
            </RowIcon>
            <RowText>
                <RowName variant="body2">{evaluation.functionName}</RowName>
                <RowTags>
                    {evaluation.template ? (
                        <>
                            <Badge title={evaluation.template.description}>{evaluation.template.label}</Badge>
                            <Badge>{formatTemplateKind(evaluation.template.kind)}</Badge>
                        </>
                    ) : (
                        <Badge>Custom</Badge>
                    )}
                    {evaluation.evalSetFile && <EvalsetTag evalset={evalsetOf(evaluation)} onOpen={openEvalset} />}
                </RowTags>
            </RowText>
            <RowActions>
                <RowAction
                    status={statusOf(evaluation.functionName)}
                    isBusy={isBusy}
                    onRun={() => run([evaluation.functionName])}
                    onStop={() => stop([evaluation.functionName])}
                />
                <MenuTrigger onOpen={(anchor) => toggleMenu(anchor, evaluationActions(evaluation))} />
            </RowActions>
        </Row>
    );

    // The click that opens another row's menu also reaches this handler, so only close the menu it was opened for.
    const closeMenu = () => {
        const anchor = menu?.anchor;
        setMenu((current) => (current?.anchor === anchor ? undefined : current));
    };

    const toggleMenu = (anchor: HTMLElement, actions: MenuAction[]) =>
        setMenu((current) => (current?.anchor === anchor ? undefined : { anchor, actions }));

    const renderMenu = () => menu && (
        <Menu>
            {menu.actions.map((action) => (
                <MenuItem
                    key={action.id}
                    sx={action.disabled ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
                    item={{
                        id: action.id,
                        label: <MenuLabel><Codicon name={action.icon} />{action.label}</MenuLabel>,
                        onClick: () => {
                            setMenu(undefined);
                            if (!action.disabled) {
                                action.onSelect();
                            }
                        },
                    }}
                />
            ))}
        </Menu>
    );

    const renderContent = () => {
        if (error) {
            return <ErrorMessage variant="body2">{error}</ErrorMessage>;
        }
        if (!evaluations) {
            return <RelativeLoader />;
        }
        if (evaluations.length === 0) {
            return (
                <EmptyState>
                    <EmptyText>
                        <EmptyTitle variant="body1">No evaluations for {agentName} yet</EmptyTitle>
                        <Message variant="body2">
                            Run your agent against test inputs and check its responses.
                        </Message>
                    </EmptyText>
                    <Button appearance="primary" onClick={createEvaluation}>
                        <Codicon name="add" sx={{ marginRight: 4 }} />
                        Create evaluation
                    </Button>
                </EmptyState>
            );
        }
        if (visibleEvaluations.length === 0) {
            return (
                <EmptyState>
                    <Message variant="body2">No evaluations match "{query.trim()}".</Message>
                </EmptyState>
            );
        }
        return <List>{visibleEvaluations.map(renderRow)}</List>;
    };

    return (
        <PopupModal
            onClose={onClose}
            expanded
            height={step === "list" ? LIST_HEIGHT : "95vh"}
            maxWidth={step === "templates" ? GALLERY_MAX_WIDTH : POPUP_MAX_WIDTH}
            ariaLabelledBy="agent-evaluations-title"
        >
            {(close) => (
                <PopupModalStep key={step === "templates" ? "create" : step} $direction={direction}>
                    <PopupHeader>
                        {step !== "list" && (
                            <BackButton
                                appearance="icon"
                                onClick={goBack}
                            >
                                <Codicon name="chevron-left" />
                            </BackButton>
                        )}
                        <HeaderTitleContainer>
                            <PopupTitle variant="h2" id="agent-evaluations-title">{title}</PopupTitle>
                            <PopupSubtitle variant="body2">{subtitle}</PopupSubtitle>
                        </HeaderTitleContainer>
                        <HeaderActions>
                            {step === "list" && !isEmpty && (
                                <ListActions
                                    isBusy={isBusy}
                                    canRunAll={evaluations?.length > 0}
                                    onCreateEvaluation={createEvaluation}
                                    onRunAll={() => run(evaluations.map((evaluation) => evaluation.functionName))}
                                    onStopAll={() => stop()}
                                />
                            )}
                            <CloseButton appearance="icon" onClick={close}>
                                <Codicon name="close" />
                            </CloseButton>
                        </HeaderActions>
                    </PopupHeader>
                    {step === "list" ? (
                        <>
                            {!isEmpty && (
                                <SearchBar>
                                    <TemplateSearch value={query} placeholder="Search evaluations" onChange={setQuery} />
                                </SearchBar>
                            )}
                            <PopupContent>{renderContent()}</PopupContent>
                            <Popover
                                open={Boolean(menu)}
                                anchorEl={menu?.anchor}
                                handleClose={closeMenu}
                                anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
                                transformOrigin={{ vertical: "top", horizontal: "right" }}
                                sx={{ zIndex: 2100, padding: 0, backgroundColor: "transparent", boxShadow: "none" }}
                            >
                                {renderMenu()}
                            </Popover>
                            <PopupFooter>
                                <Button appearance="secondary" onClick={openEvalsets}>
                                    <Codicon name="collection" sx={{ marginRight: 6 }} />
                                    View evalsets
                                </Button>
                                <Button appearance="secondary" onClick={openHistory}>
                                    <Codicon name="history" sx={{ marginRight: 4 }} />
                                    View history
                                </Button>
                            </PopupFooter>
                        </>
                    ) : (
                        <Suspense fallback={<PopupContent><RelativeLoader /></PopupContent>}>
                            {step === "edit" ? (
                                <AIEvaluationFormBody
                                    projectPath={projectPath}
                                    functionName={editing.functionName}
                                    filePath={resolveEvalsetPath(projectPath, editing.lineRange.fileName)}
                                    serviceType="UPDATE_TEST"
                                    agentName={agentName}
                                    embedded
                                    onSaved={handleSaved}
                                />
                            ) : (
                                <NewEvaluation
                                    projectPath={projectPath}
                                    agentName={agentName}
                                    templatesOpen={step === "templates"}
                                    onTemplatesOpenChange={(open) => setStep(open ? "templates" : "create")}
                                    onChoose={setChoice}
                                    onSaved={handleSaved}
                                />
                            )}
                        </Suspense>
                    )}
                </PopupModalStep>
            )}
        </PopupModal>
    );
}

export default AgentEvaluationsPopup;
