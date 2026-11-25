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

import React, { useEffect, useRef, useState } from "react";
import styled from "@emotion/styled";
import { CodeData, ParentMetadata } from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { ThemeColors, Tooltip } from "@wso2/ui-toolkit";
import { DataNode, treeKeyDown } from "../DataBrowser/tree";
import { useDataTree } from "../DataBrowser/useDataTree";
import { S } from "../DataBrowser/styles";

const VISIBLE_CHIPS = 2;

export interface Input {
    name: string;
    type: string;
}

interface FlowInputsProps {
    filePath: string;
    body?: CodeData;
    inputs: Input[];
    returnType?: string;
    onEdit?: () => void;
}

const Signature = styled.span`
    display: inline-flex;
    align-items: baseline;
    gap: 4px;
    font-family: var(--vscode-editor-font-family);
    font-size: 13px;
    color: var(--vscode-descriptionForeground);
`;

const Chip = styled.span`
    display: block;
    box-sizing: border-box;
    height: 20px;
    max-width: 160px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--vscode-editor-font-family);
    font-size: 12px;
    line-height: 20px;
    padding: 0 6px;
    border: none;
    border-radius: 4px;
    background-color: ${ThemeColors.SURFACE_CONTAINER};
    color: var(--vscode-foreground);
`;

const InputChip = styled(Chip)`
    cursor: pointer;

    &:hover, &[aria-expanded="true"] {
        background-color: var(--vscode-toolbar-hoverBackground);
    }
`;

const MoreChip = styled(InputChip)`
    font-family: inherit;
    color: var(--vscode-textLink-foreground);
`;

const Anchor = styled.span`
    position: relative;
`;

const Panel = styled.div`
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    z-index: 2000;
    width: 320px;
    max-height: 360px;
    overflow-y: auto;
    padding: 8px 0 0;
    border-radius: 8px;
    background-color: ${ThemeColors.SURFACE_DIM};
    color: var(--vscode-foreground);
    font-family: var(--vscode-font-family);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.16);
`;

const ListHeader = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 24px;
    padding: 0 16px;
    font-size: 13px;
    font-weight: 600;
    color: var(--vscode-foreground);
`;

const EditLink = styled.button`
    border: none;
    background: none;
    padding: 0;
    font-size: 12px;
    color: var(--vscode-textLink-foreground);
    cursor: pointer;
`;

// Undefined until the flow's inputs load; a refetch for the same flow keeps the last list.
export function useInputs(filePath: string, flow?: ParentMetadata, body?: CodeData): Input[] | undefined {
    const { rpcClient } = useRpcContext();
    const [loaded, setLoaded] = useState<{ key: string; inputs: Input[] }>();
    const key = `${filePath}#${flow?.label}`;
    const line = body?.lineRange?.startLine.line;
    const offset = body?.lineRange?.startLine.offset;
    const setInputs = (inputs: Input[]) => setLoaded({ key, inputs });

    useEffect(() => {
        if (!filePath || line === undefined) {
            setInputs([]);
            return;
        }
        let cancelled = false;
        // Just inside the body's `{`, where only the signature's parameters are in scope as inputs.
        rpcClient.getBIDiagramRpcClient()
            .getVisibleVariableTypes({ filePath, position: { line, offset: offset + 1 } })
            .then((response) => {
                const parameters = response?.categories?.find((category) => category.name === "Parameters");
                if (!cancelled) {
                    setInputs((parameters?.types ?? []).map((item) => ({ name: item.name, type: item.type?.name ?? "" })));
                }
            })
            .catch(() => !cancelled && setInputs([]));
        return () => {
            cancelled = true;
        };
    }, [key, line, offset]);

    return loaded?.key === key ? loaded.inputs : undefined;
}

function useDismiss(isOpen: boolean, ref: React.RefObject<HTMLElement>, close: () => void) {
    useEffect(() => {
        if (!isOpen) {
            return;
        }
        const onPointer = (event: MouseEvent) => !ref.current?.contains(event.target as Node) && close();
        const onKey = (event: KeyboardEvent) => event.key === "Escape" && close();
        document.addEventListener("mousedown", onPointer);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onPointer);
            document.removeEventListener("keydown", onKey);
        };
    }, [isOpen]);
}

const MORE = "+";

// The inputs as the Data Browser shows them, so record fields open in place; the lookup runs only while a panel is open.
function InputTree({ filePath, body, roots, expandRoot }: { filePath: string; body?: CodeData; roots: Input[]; expandRoot: boolean }) {
    const start = body?.lineRange?.startLine;
    const position = start && { line: start.line, offset: start.offset + 1 };
    const { childrenOf } = useDataTree(filePath, position && { startLine: position, endLine: position }, undefined, 0);
    return (
        <S.Tree role="tree" onKeyDown={treeKeyDown(() => undefined)}>
            {roots.map((input) => (
                <DataNode key={input.name} item={{ path: input.name, ...input }} depth={0} fetchFields={childrenOf} defaultExpanded={expandRoot} />
            ))}
        </S.Tree>
    );
}

// The flow's signature beside its name: inputs as chips that open their fields, then the return type.
export function FlowInputs({ filePath, body, inputs, returnType, onEdit }: FlowInputsProps) {
    const [open, setOpen] = useState<string>();
    const signatureRef = useRef<HTMLSpanElement>(null);
    useDismiss(!!open, signatureRef, () => setOpen(undefined));
    const hidden = inputs.length - VISIBLE_CHIPS;
    const toggle = (key: string) => setOpen(open === key ? undefined : key);
    const tree = (roots: Input[]) => <InputTree filePath={filePath} body={body} roots={roots} expandRoot={roots.length === 1} />;

    return (
        <Signature ref={signatureRef} data-testid="flow-inputs">
            (
            {inputs.slice(0, VISIBLE_CHIPS).map((input) => (
                <Anchor key={input.name}>
                    <InputChip as="button" aria-expanded={open === input.name} onClick={() => toggle(input.name)}>
                        {input.name}
                    </InputChip>
                    {open === input.name && (
                        <Panel role="dialog" aria-label={input.name}>
                            {tree([input])}
                        </Panel>
                    )}
                </Anchor>
            ))}
            {hidden > 0 && (
                <Anchor>
                    <MoreChip as="button" aria-expanded={open === MORE} onClick={() => toggle(MORE)} aria-label={`Show all ${inputs.length} inputs`}>+{hidden}</MoreChip>
                    {open === MORE && (
                        <Panel role="dialog" aria-label="Inputs">
                            <ListHeader>
                                Inputs
                                {onEdit && <EditLink onClick={() => { setOpen(undefined); onEdit(); }}>Edit Inputs</EditLink>}
                            </ListHeader>
                            {tree(inputs)}
                        </Panel>
                    )}
                </Anchor>
            )}
            )
            {returnType && (
                <>
                    <span aria-label="returns">→</span>
                    <Tooltip content={returnType} position="bottom">
                        <Chip>{returnType}</Chip>
                    </Tooltip>
                </>
            )}
        </Signature>
    );
}
