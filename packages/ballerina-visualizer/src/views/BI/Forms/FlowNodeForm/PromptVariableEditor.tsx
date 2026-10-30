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

import React, { useCallback, useMemo, useState } from "react";
import styled from "@emotion/styled";
import { getPrimaryInputType, LineRange, NodeMetadata, PromptVariable } from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { ExpandedEditor, FormField, InputMode } from "@wso2/ballerina-side-panel";
import { Button, Codicon, ThemeColors, Typography } from "@wso2/ui-toolkit";
import { applyModifications, textToModifications } from "../../../../utils/utils";

const Footer = styled.div`
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 12px;
    padding: 0 18px 12px;
`;

type OpenVariable = { field: FormField; filePath: string };
type SavedEdits = { base: LineRange; target: LineRange; variables: Record<string, PromptVariable> };

// The form copies its rendered fields back into its own state, so a link is recognised by this label.
const LINK_LABEL = <><Codicon name="edit" />Open in Prompt Editor</>;

const unlink = (field: FormField): FormField =>
    field.actionLabel === LINK_LABEL ? { ...field, actionLabel: undefined, actionCallback: undefined } : field;

const getPromptVariable = (field?: FormField): PromptVariable | undefined =>
    (field?.metadata?.data as NodeMetadata)?.promptVariable;

// A template cannot hold a bare backtick, so each one goes in as an interpolated literal.
export const escapeTemplateBackticks = (source: string): string => {
    const start = source.indexOf("`");
    const end = source.lastIndexOf("`");
    if (end <= start) {
        return source;
    }
    return source.slice(0, start + 1) + source.slice(start + 1, end).replace(/`/g, '${"`"}') + source.slice(end);
};

// The editor emits nothing for an empty prompt, which is not a valid initializer.
const emptyTemplate = (field: FormField) =>
    getPrimaryInputType(field.types)?.ballerinaType === "string" ? "string ``" : "``";

export const replacedLineRange = (edited: LineRange, source: string): LineRange => {
    const lines = source.split("\n");
    const lastLine = lines[lines.length - 1];
    const offset = lines.length === 1 ? edited.startLine.offset + lastLine.length : lastLine.length;
    return { ...edited, endLine: { line: edited.startLine.line + lines.length - 1, offset } };
};

// shortcut: a range starting on the edit's last line keeps its offsets; only line shifts are tracked.
export const shiftLineRange = (range: LineRange, fileName: string, edited: LineRange, replaced: LineRange): LineRange => {
    if (fileName !== edited.fileName || range.startLine.line <= edited.endLine.line) {
        return range;
    }
    const delta = replaced.endLine.line - edited.endLine.line;
    return {
        ...range,
        startLine: { ...range.startLine, line: range.startLine.line + delta },
        endLine: { ...range.endLine, line: range.endLine.line + delta },
    };
};

// Edits the variable a prompt field refers to; later edits in the open form land on the shifted ranges.
export function usePromptVariableEditor(fields: FormField[], targetLineRange: LineRange, targetFileName?: string) {
    const { rpcClient } = useRpcContext();
    const [saved, setSaved] = useState<SavedEdits>();
    const [open, setOpen] = useState<OpenVariable>();
    const [draft, setDraft] = useState<string>();
    const [saveFailed, setSaveFailed] = useState(false);
    // Fields whose value no longer refers to their variable, e.g. after switching to prompt mode.
    const [detached, setDetached] = useState<Record<string, boolean>>({});
    const edits = saved?.base === targetLineRange ? saved : undefined;

    const variableOf = (field: FormField) => {
        const variable = getPromptVariable(field);
        return variable && (edits?.variables[variable.name] ?? variable);
    };

    const openEditor = async (field: FormField) => {
        const { filePath } = await rpcClient.getVisualizerRpcClient()
            .joinProjectPath({ segments: [getPromptVariable(field).lineRange.fileName] });
        setOpen({ field, filePath });
    };

    const linkedFields = useMemo(() => fields.map((field) => getPromptVariable(field) && !detached[field.key] ? {
        ...field,
        actionLabel: LINK_LABEL,
        actionCallback: () => openEditor(field),
    } : unlink(field)), [fields, detached]);

    const onFieldChange = useCallback((key: string, value: unknown) => {
        const variable = getPromptVariable(fields.find((field) => field.key === key));
        if (!variable) {
            return;
        }
        const isDetached = String(value ?? "").trim() !== variable.name;
        setDetached((prev) => prev[key] === isDetached ? prev : { ...prev, [key]: isDetached });
    }, [fields]);

    const close = () => {
        setOpen(undefined);
        setDraft(undefined);
        setSaveFailed(false);
    };

    const save = async () => {
        const variable = variableOf(open.field);
        const source = escapeTemplateBackticks(draft || emptyTemplate(open.field));
        const { startLine, endLine } = variable.lineRange;
        const position = { startLine: startLine.line, startColumn: startLine.offset, endLine: endLine.line, endColumn: endLine.offset };
        const written = await applyModifications(rpcClient, textToModifications(source, position), open.filePath)
            .catch((): boolean => false);
        if (!written) {
            setSaveFailed(true);
            return;
        }
        const replaced = replacedLineRange(variable.lineRange, source);
        const shift = (range: LineRange, fileName = range.fileName) =>
            shiftLineRange(range, fileName, variable.lineRange, replaced);
        const variables = Object.fromEntries(fields.map(variableOf).filter(Boolean).map((other) => [other.name,
            other.name === variable.name
                ? { ...other, value: draft, lineRange: replaced }
                : { ...other, lineRange: shift(other.lineRange) }]));
        setSaved({ base: targetLineRange, target: shift(edits?.target ?? targetLineRange, targetFileName), variables });
        close();
    };

    const variable = open && variableOf(open.field);
    const promptVariableEditor = variable && (
        <ExpandedEditor
            isOpen
            field={{ ...open.field, label: variable.name }}
            value={draft ?? variable.value}
            mode={InputMode.PROMPT}
            fileName={open.filePath}
            targetLineRange={variable.lineRange}
            onChange={(value: string) => setDraft(value)}
            onClose={close}
            onSave={save}
            footer={
                <Footer>
                    {saveFailed && (
                        <Typography variant="body3" sx={{ color: ThemeColors.ERROR }}>
                            The variable could not be saved.
                        </Typography>
                    )}
                    {variable.references > 1 && (
                        <Typography variant="body3">
                            {`Used in ${variable.references} places. Saving updates all of them.`}
                        </Typography>
                    )}
                    <Button appearance="primary" disabled={draft === undefined} onClick={save}>
                        Save
                    </Button>
                </Footer>
            }
        />
    );

    return { fields: linkedFields, targetLineRange: edits?.target ?? targetLineRange, promptVariableEditor, onFieldChange };
}
