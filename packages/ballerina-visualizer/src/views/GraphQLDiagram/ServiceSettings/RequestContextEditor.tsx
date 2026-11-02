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

import React, { useState } from "react";
import type { ContextEntry, GraphqlContextResponse } from "@wso2/ballerina-core";
import { Button, CheckBox, Codicon, Dropdown, ProgressRing } from "@wso2/ui-toolkit";
import {
    Actions,
    Code,
    Description,
    ErrorText,
    FunctionCard,
    InlineActions,
    LinkButton,
    Section,
    SectionTitle,
    WarningBox,
} from "./styles";
import { ContextEntriesEditor } from "./ContextEntriesEditor";

export const CONTEXT_INIT_SIGNATURE =
    "isolated function (http:RequestContext, http:Request) returns graphql:Context|error";

interface RequestContextEditorProps {
    context?: GraphqlContextResponse;
    loading: boolean;
    busy: boolean;
    error?: string;
    onCreate: () => void;
    onUse: (functionName: string) => void;
    onRemove: (deleteFunction: boolean) => void;
    onSaveEntries: (entries: ContextEntry[]) => void;
    onOpenFunction: () => void;
    onCancel: () => void;
}

/**
 * The Request Context editor: creates the context function a GraphQL service's `contextInit` names, picks an
 * existing one, opens it in the flow diagram, or removes it.
 */
export function RequestContextEditor(props: RequestContextEditorProps) {
    const { context, loading, busy, error, onCreate, onUse, onRemove, onSaveEntries, onOpenFunction, onCancel } = props;
    const [picked, setPicked] = useState<string>("");
    const [confirmingRemove, setConfirmingRemove] = useState(false);
    const [deleteFunction, setDeleteFunction] = useState(true);

    if (loading || !context) {
        return <ProgressRing />;
    }

    const otherCandidates = context.candidates.filter((name) => name !== context.functionName);
    const picker = otherCandidates.length > 0 && (
        <InlineActions>
            <Dropdown
                id="context-function-picker"
                aria-label="Existing context function"
                value={picked}
                items={[
                    { id: "none", value: "", content: "Choose a function" },
                    ...otherCandidates.map((name) => ({ id: name, value: name, content: name })),
                ]}
                onValueChange={setPicked}
                containerSx={{ flex: 1 }}
            />
            <Button appearance="secondary" disabled={!picked || busy} onClick={() => onUse(picked)}>Use</Button>
        </InlineActions>
    );

    if (!context.configured) {
        return (
            <Section>
                <Description>
                    A request context passes values from each request, such as a header, to your resolvers. Each
                    resolver reads them through its <Code>graphql:Context</Code> parameter.
                </Description>
                <Description>
                    Creating one adds a context function to <Code>functions.bal</Code> and sets it on this service.
                    The generated code compiles as is.
                </Description>
                {error && <ErrorText role="alert">{error}</ErrorText>}
                <Actions>
                    <Button appearance="secondary" onClick={onCancel} disabled={busy}>Cancel</Button>
                    <Button appearance="primary" onClick={onCreate} disabled={busy} data-testid="create-context-btn">
                        {busy ? "Creating..." : "Create Context Function"}
                    </Button>
                </Actions>
                {picker && (
                    <>
                        <SectionTitle>Or use an existing function</SectionTitle>
                        {picker}
                    </>
                )}
            </Section>
        );
    }

    const canOpen = !!context.functionFilePath && !!context.functionRange;
    return (
        <Section>
            <Description>
                Resolvers receive the context this function builds for each request.
            </Description>
            <FunctionCard>
                <Codicon name="symbol-method" />
                <Code style={{ flex: 1 }}>{context.functionName ?? context.expression}</Code>
                {canOpen && (
                    <LinkButton onClick={onOpenFunction} data-testid="open-context-function">
                        Open in flow diagram
                    </LinkButton>
                )}
            </FunctionCard>
            {context.functionName && !context.signatureValid && (
                <WarningBox role="status">
                    This function does not have the signature a context function needs:
                    <br />
                    <Code>{CONTEXT_INIT_SIGNATURE}</Code>
                </WarningBox>
            )}
            {context.editable ? (
                <ContextEntriesEditor
                    entries={context.entries}
                    saving={busy}
                    error={error}
                    onSave={onSaveEntries}
                />
            ) : context.signatureValid && context.notEditableReason && (
                <WarningBox role="status" data-testid="context-not-editable">
                    {context.notEditableReason}
                </WarningBox>
            )}
            {!context.functionName && (
                <WarningBox role="status">
                    The context is set to an expression. Edit it in the source code.
                </WarningBox>
            )}
            {picker && (
                <>
                    <SectionTitle>Use a different function</SectionTitle>
                    {picker}
                </>
            )}
            {error && !context.editable && <ErrorText role="alert">{error}</ErrorText>}
            {confirmingRemove ? (
                <WarningBox>
                    <Description>Resolvers will no longer receive these context values.</Description>
                    {context.functionName && (
                        <CheckBox
                            label={`Also delete ${context.functionName} if nothing else uses it`}
                            checked={deleteFunction}
                            onChange={setDeleteFunction}
                        />
                    )}
                    <Actions>
                        <Button appearance="secondary" onClick={() => setConfirmingRemove(false)} disabled={busy}>
                            Keep
                        </Button>
                        <Button
                            appearance="primary"
                            onClick={() => onRemove(!!context.functionName && deleteFunction)}
                            disabled={busy}
                        >
                            {busy ? "Removing..." : "Remove Context"}
                        </Button>
                    </Actions>
                </WarningBox>
            ) : (
                <Actions>
                    <Button appearance="secondary" onClick={() => setConfirmingRemove(true)} disabled={busy}>
                        Remove Context
                    </Button>
                    <Button appearance="primary" onClick={onCancel} disabled={busy}>Done</Button>
                </Actions>
            )}
        </Section>
    );
}
