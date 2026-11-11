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

import React, { useEffect, useState } from "react";
import styled from "@emotion/styled";
import {
    ApplyGraphqlContextRequest,
    ContextEntry,
    EVENT_TYPE,
    GraphqlContextResponse,
    NodePosition,
} from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { PanelContainer } from "@wso2/ballerina-side-panel";
import {
    ActionButtons,
    Button,
    CheckBox,
    Codicon,
    Divider,
    Dropdown,
    LinkButton,
    ProgressRing,
    SidePanelBody,
    Typography,
} from "@wso2/ui-toolkit";
import {
    ActionIconWrapper,
    ContentSection,
    DeleteIconWrapper,
    EditIconWrapper,
    EditorContainer,
    EditorContent,
    HeaderLabel,
    headerLabelStyles,
} from "../../BI/ServiceDesigner/styles";
import { ContextValueItem } from "./ContextValueItem";
import { ContextValueEditor } from "./ContextValueEditor";
import { isDirty, newEntry, normalizeEntries } from "./contextEntries";
import { contextRequest } from "./useGraphqlContext";

const CONTEXT_INIT_SIGNATURE =
    "isolated function (http:RequestContext, http:Request) returns graphql:Context|error";

const Section = styled.div`
    margin-bottom: 16px;
`;

const Hint = styled.p`
    margin: 4px 0 12px;
    color: var(--vscode-descriptionForeground);
    font-size: 12px;
    line-height: 1.5;
`;

const Notice = styled.div`
    margin: 8px 0;
    padding: 8px 10px;
    border-left: 3px solid var(--vscode-editorWarning-foreground);
    background: var(--vscode-editorWidget-background);
    font-size: 12px;
    line-height: 1.5;
`;

const ErrorText = styled.p`
    margin: 8px 0;
    color: var(--vscode-errorForeground);
    font-size: 12px;
`;

const Code = styled.code`
    font-family: var(--vscode-editor-font-family);
    font-size: 12px;
`;

const FunctionName = styled.span`
    font-family: var(--vscode-editor-font-family);
`;

const AddButtonWrapper = styled.div`
    margin: 8px 0;
`;

// The resource form's row icons assume one edit and one delete; this row has three actions, so they get even
// spacing of their own instead of the edit wrapper's, which leaves none between two of them.
const FunctionActions = styled(ActionIconWrapper)`
    gap: 10px;

    & > div {
        margin-left: 0;
    }
`;

const PickerRow = styled.div`
    display: flex;
    align-items: flex-end;
    gap: 8px;
`;

/** What is open in place of the list: a value's editor, the function picker, or the remove confirmation. */
type Editing =
    | { kind: "value"; index: number }
    | { kind: "function" }
    | { kind: "remove" };

interface RequestContextPanelProps {
    filePath: string;
    position: NodePosition;
    context?: GraphqlContextResponse;
    loading: boolean;
    onClose: () => void;
    /** Opens the service's full configuration, for every ServiceConfig field other than the context. */
    onOpenServiceConfig: () => void;
}

/**
 * The Request Context panel of a GraphQL service. It creates the context function the service's `contextInit`
 * names, or picks an existing one, and edits the values the function sets on the context, laid out like the
 * resource form: a list of rows with edit and delete, an add link, and an editor that opens in place.
 */
export function RequestContextPanel(props: RequestContextPanelProps) {
    const { filePath, position, context, loading, onClose, onOpenServiceConfig } = props;
    const { rpcClient } = useRpcContext();
    const [draft, setDraft] = useState<ContextEntry[]>(context?.entries ?? []);
    const [editing, setEditing] = useState<Editing>();
    const [picked, setPicked] = useState<string>("");
    const [deleteFunction, setDeleteFunction] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string>();
    // What the last change did differently from what was asked, such as keeping a function still in use.
    const [note, setNote] = useState<string>();

    // A save, or an edit made in source, refreshes the context; start again from what the function sets now.
    const savedSignature = JSON.stringify(context?.entries ?? []);
    // An error belongs to the editor it came from: opening, switching or cancelling one drops it.
    useEffect(() => setError(undefined), [editing]);
    useEffect(() => {
        setDraft(context?.entries ?? []);
        setEditing(undefined);
    }, [savedSignature, context?.functionName]);

    const apply = async (request: Omit<ApplyGraphqlContextRequest, "filePath" | "codedata">,
                         closeAfter = false) => {
        setBusy(true);
        setError(undefined);
        setNote(undefined);
        try {
            const response = await rpcClient.getServiceDesignerRpcClient().applyGraphqlContext({
                ...contextRequest(filePath, position),
                ...request,
            });
            if (response?.errorMsg) {
                setError(response.errorMsg);
                return;
            }
            // The edit updates the project, and the diagram's content-updated listener refetches the context.
            setNote(response?.note);
            setEditing(undefined);
            if (closeAfter) {
                onClose();
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    };

    const openFunction = async () => {
        if (!context?.functionFilePath || !context.functionRange) {
            return;
        }
        const range = context.functionRange;
        await rpcClient.getVisualizerRpcClient().openView({
            type: EVENT_TYPE.OPEN_VIEW,
            location: {
                documentUri: context.functionFilePath,
                position: {
                    startLine: range.startLine.line,
                    startColumn: range.startLine.offset,
                    endLine: range.endLine.line,
                    endColumn: range.endLine.offset,
                },
            },
        });
    };

    const saveValue = (index: number, entry: ContextEntry) => {
        setDraft((current) => index < current.length
            ? current.map((existing, i) => (i === index ? entry : existing))
            : [...current, entry]);
        setEditing(undefined);
    };

    const candidates = (context?.candidates ?? []).filter((name) => name !== context?.functionName);
    const allConfigs = (
        <Section>
            <LinkButton onClick={onOpenServiceConfig} data-testid="open-service-config">
                <Codicon name="settings-gear" />
                <>Access all service configurations</>
            </LinkButton>
        </Section>
    );

    const functionDropdown = (
        <Dropdown
            id="context-function-picker"
            label="Existing function"
            value={picked}
            items={[
                { id: "none", value: "", content: "Choose a function" },
                ...candidates.map((name) => ({ id: name, value: name, content: name })),
            ]}
            onValueChange={setPicked}
            containerSx={{ flex: 1 }}
        />
    );

    const renderNotConfigured = () => (
        <>
            <Section>
                <Typography sx={{ marginBlockEnd: 4 }} variant="h4">Context Function</Typography>
                <Hint>Pass values from each request, such as headers, to your resolvers.</Hint>
                <Button
                    appearance="primary"
                    disabled={busy}
                    onClick={() => apply({ action: "create" })}
                    data-testid="create-context-btn"
                >
                    <Codicon name="add" sx={{ marginRight: 4 }} /> {busy ? "Creating..." : "Create Context Function"}
                </Button>
            </Section>
            {candidates.length > 0 && (
                <Section>
                    <Hint>Or use an existing function:</Hint>
                    <PickerRow>
                        {functionDropdown}
                        <Button
                            appearance="secondary"
                            disabled={!picked || busy}
                            onClick={() => apply({ action: "use", functionName: picked })}
                        >
                            Use
                        </Button>
                    </PickerRow>
                </Section>
            )}
            {error && <ErrorText role="alert">{error}</ErrorText>}
            <Divider />
            {allConfigs}
        </>
    );

    const renderConfigured = () => {
        const canOpen = !!context.functionFilePath && !!context.functionRange;
        const expressionScope = context.functionFilePath && context.valueScope
            ? { filePath: context.functionFilePath, lineRange: context.valueScope }
            : undefined;
        // The editor of the value at the index; the index just past the last value is a new one.
        const renderValueEditor = (index: number) => {
            const isNew = index === draft.length;
            return (
                <ContextValueEditor
                    key={`editor-${index}`}
                    entry={isNew ? newEntry() : draft[index]}
                    others={draft.filter((_, i) => i !== index)}
                    isNew={isNew}
                    expressionScope={expressionScope}
                    onSave={(entry) => saveValue(index, entry)}
                    onCancel={() => setEditing(undefined)}
                />
            );
        };
        const dirty = isDirty(context.entries, draft);
        return (
            <>
                <Section>
                    <Typography sx={{ marginBlockEnd: 4 }} variant="h4">Context Function</Typography>
                    <HeaderLabel data-testid="context-function">
                        <ContentSection>
                            <div
                                className={headerLabelStyles}
                                {...(canOpen && {
                                    role: "button",
                                    tabIndex: 0,
                                    title: "Open in flow diagram",
                                    onClick: openFunction,
                                    onKeyDown: (event: React.KeyboardEvent) => {
                                        if (event.key === "Enter" || event.key === " ") {
                                            event.preventDefault();
                                            openFunction();
                                        }
                                    },
                                })}
                            >
                                <Codicon name="symbol-method" sx={{ marginRight: 8 }} />
                                <FunctionName>{context.functionName ?? context.expression}</FunctionName>
                            </div>
                            <FunctionActions>
                                {canOpen && (
                                    <EditIconWrapper title="Open in flow diagram">
                                        <Codicon name="go-to-file" onClick={openFunction} />
                                    </EditIconWrapper>
                                )}
                                {candidates.length > 0 && (
                                    <EditIconWrapper title="Use a different function">
                                        <Codicon name="edit" onClick={() => setEditing({ kind: "function" })} />
                                    </EditIconWrapper>
                                )}
                                <DeleteIconWrapper title="Remove the request context">
                                    <Codicon name="trash" onClick={() => setEditing({ kind: "remove" })} />
                                </DeleteIconWrapper>
                            </FunctionActions>
                        </ContentSection>
                    </HeaderLabel>
                    {context.functionName && !context.signatureValid && (
                        <Notice role="status">
                            This function does not have the signature a context function needs:
                            <br />
                            <Code>{CONTEXT_INIT_SIGNATURE}</Code>
                        </Notice>
                    )}
                    {editing?.kind === "function" && (
                        <EditorContainer>
                            <EditorContent>
                                <Typography sx={{ marginBlockEnd: 0, marginTop: 5 }} variant="h4">
                                    Use a Different Function
                                </Typography>
                            </EditorContent>
                            <Divider />
                            {functionDropdown}
                            {error && <ErrorText role="alert">{error}</ErrorText>}
                            <ActionButtons
                                primaryButton={{
                                    text: busy ? "Saving..." : "Use",
                                    onClick: () => apply({ action: "use", functionName: picked }),
                                    disabled: !picked || busy,
                                }}
                                secondaryButton={{ text: "Cancel", onClick: () => setEditing(undefined), disabled: busy }}
                                sx={{ justifyContent: "flex-end", marginTop: 8 }}
                            />
                        </EditorContainer>
                    )}
                    {editing?.kind === "remove" && (
                        <EditorContainer data-testid="remove-context">
                            <EditorContent>
                                <Typography sx={{ marginBlockEnd: 0, marginTop: 5 }} variant="h4">
                                    Remove Request Context
                                </Typography>
                            </EditorContent>
                            <Divider />
                            <Hint>Resolvers will no longer receive these context values.</Hint>
                            {context.functionName && (
                                <CheckBox
                                    label={`Also delete ${context.functionName} if nothing else uses it`}
                                    checked={deleteFunction}
                                    onChange={setDeleteFunction}
                                />
                            )}
                            {error && <ErrorText role="alert">{error}</ErrorText>}
                            <ActionButtons
                                primaryButton={{
                                    text: busy ? "Removing..." : "Remove",
                                    onClick: () => apply({
                                        action: "remove",
                                        deleteFunction: !!context.functionName && deleteFunction,
                                    }),
                                    disabled: busy,
                                }}
                                secondaryButton={{ text: "Cancel", onClick: () => setEditing(undefined), disabled: busy }}
                                sx={{ justifyContent: "flex-end", marginTop: 8 }}
                            />
                        </EditorContainer>
                    )}
                </Section>
                <Divider />
                <Section>
                    <Typography sx={{ marginBlockEnd: 4, marginTop: 12 }} variant="h4">Context Values</Typography>
                    {context.editable ? (
                        <>
                            {draft.length === 0 && editing?.kind !== "value" && (
                                <Hint>No values yet. Add one to pass request data to your resolvers.</Hint>
                            )}
                            {draft.map((entry, index) => (
                                editing?.kind === "value" && editing.index === index ? renderValueEditor(index) : (
                                    <ContextValueItem
                                        key={`${entry.key}-${index}`}
                                        entry={entry}
                                        readonly={!!editing}
                                        onEdit={() => setEditing({ kind: "value", index })}
                                        onDelete={() => setDraft(draft.filter((_, i) => i !== index))}
                                    />
                                )
                            ))}
                            {editing?.kind === "value" && editing.index === draft.length
                                && renderValueEditor(draft.length)}
                            {!editing && (
                                <AddButtonWrapper>
                                    <LinkButton
                                        onClick={() => setEditing({ kind: "value", index: draft.length })}
                                        data-testid="add-context-value"
                                    >
                                        <Codicon name="add" />
                                        <>Context Value</>
                                    </LinkButton>
                                </AddButtonWrapper>
                            )}
                            {draft.length > 0 && (
                                <Hint>Resolvers read a value with <Code>context.get("key")</Code>.</Hint>
                            )}
                        </>
                    ) : (
                        <Notice role="status" data-testid="context-not-editable">
                            {context.notEditableReason ?? "These values are edited in source."}
                        </Notice>
                    )}
                </Section>
                {error && editing?.kind !== "function" && editing?.kind !== "remove" && (
                    <ErrorText role="alert">{error}</ErrorText>
                )}
                <Divider />
                {allConfigs}
                <ActionButtons
                    primaryButton={{
                        text: busy ? "Saving..." : "Save",
                        onClick: () => apply({ action: "setEntries", entries: normalizeEntries(draft) }, true),
                        tooltip: "Save",
                        disabled: busy || !dirty || !!editing,
                        loading: busy,
                    }}
                    secondaryButton={{ text: "Cancel", onClick: onClose, tooltip: "Cancel", disabled: busy }}
                    sx={{ justifyContent: "flex-end" }}
                />
            </>
        );
    };

    return (
        <PanelContainer title="Request Context" show={true} onClose={onClose}>
            <SidePanelBody data-testid="request-context-panel">
                {context?.errorMsg && (
                    <ErrorText role="alert" data-testid="context-read-error">
                        The request context could not be read: {context.errorMsg}
                    </ErrorText>
                )}
                {note && <Notice role="status" data-testid="context-note">{note}</Notice>}
                {loading && !context ? (
                    <ProgressRing />
                ) : context?.errorMsg && !context.configured ? (
                    allConfigs
                ) : context?.configured ? (
                    renderConfigured()
                ) : (
                    renderNotConfigured()
                )}
            </SidePanelBody>
        </PanelContainer>
    );
}
