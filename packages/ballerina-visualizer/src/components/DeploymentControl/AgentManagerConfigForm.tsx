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
import { AgentManagerConfigField, AgentManagerConfigForm as ConfigFormData, AgentManagerDeployTarget } from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { Button, CheckBox, Codicon, ProgressRing } from "@wso2/ui-toolkit";
import { PopupContent, PopupFooter } from "../../views/BI/Connection/styles";
import { ConfigField } from "../../views/AIPanel/components/ConfigurationCollector";

const Group = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
`;

const GroupTitle = styled.span`
    font-weight: 600;
`;

const Muted = styled.span`
    color: var(--vscode-descriptionForeground);
    font-size: 12px;
`;

const Summary = styled.div`
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--vscode-welcomePage-tileBorder);
`;

const SummaryRow = styled.span`
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--vscode-descriptionForeground);
`;

const ErrorText = styled.span`
    color: var(--vscode-errorForeground);
    word-break: break-word;
`;

interface AgentManagerConfigFormProps {
    projectPath: string;
    description: string;
    action: "hostOnPlatform" | "saveConfig";
    submitLabel: string;
    busyLabel: string;
    onDone: () => void;
    onCancel: () => void;
    onAgentName?: (name?: string) => void;
}

function groupFields(fields: AgentManagerConfigField[]): [string, AgentManagerConfigField[]][] {
    const groups = new Map<string, AgentManagerConfigField[]>();
    fields.forEach((field) => groups.set(field.group, [...(groups.get(field.group) ?? []), field]));
    return [...groups.entries()];
}

function placeholder(field: AgentManagerConfigField): string {
    if (field.saved) {
        return field.target === "env" ? "Saved. Enter a new value to replace it." : "Saved in Agent Manager's Config.toml.";
    }
    return field.required ? "Required" : "Optional";
}

export function AgentManagerConfigForm({ projectPath, description, action, submitLabel, busyLabel, onDone, onCancel, onAgentName }: AgentManagerConfigFormProps) {
    const { rpcClient } = useRpcContext();
    const [form, setForm] = useState<ConfigFormData | undefined>();
    const [values, setValues] = useState<Record<string, string>>({});
    const [secrets, setSecrets] = useState<Record<string, boolean>>({});
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | undefined>();

    const submit = async () => {
        setSubmitting(true);
        setError(undefined);
        try {
            const response = await rpcClient.getAgentManagerRpcClient().runAgentManagerAction({ projectPath, action, config: { values, secrets } });
            response.success ? onDone() : setError(response.message);
        } catch (err) {
            setError(String(err));
        } finally {
            setSubmitting(false);
        }
    };

    useEffect(() => {
        const failed = (err: unknown): ConfigFormData => ({ fields: [], fileSaved: false, error: String(err) });
        rpcClient.getAgentManagerRpcClient().getAgentManagerConfigForm({ projectPath }).catch(failed).then((loaded) => {
            const initial = Object.fromEntries(loaded.fields.filter((f) => f.localValue && !f.saved).map((f) => [f.id, f.localValue!]));
            setValues(initial);
            setSecrets(Object.fromEntries(loaded.fields.map((f) => [f.id, f.secret])));
            setForm(loaded);
            onAgentName?.(loaded.target?.agentName);
        });
    }, [projectPath]);

    if (!form) {
        return <PopupContent><ProgressRing /></PopupContent>;
    }
    const fileFields = form.fields.some((f) => f.target === "file" && !f.unsupported);
    return (
        <>
            <PopupContent>
                {form.target && <TargetSummary target={form.target} />}
                {form.fields.length > 0 && <Muted>{description}</Muted>}
                {form.error && <ErrorText>Couldn't read this agent's configurables: {form.error}</ErrorText>}
                {form.fields.length === 0 && !form.error && <Muted>This agent has no configurables to set.</Muted>}
                {groupFields(form.fields).map(([group, fields]) => (
                    <Group key={group}>
                        {group && <GroupTitle>{group}</GroupTitle>}
                        {fields.map((field) => (
                            <ConfigFieldInput
                                key={field.id}
                                field={field}
                                value={values[field.id] ?? ""}
                                secret={secrets[field.id] ?? field.secret}
                                onValue={(value) => setValues({ ...values, [field.id]: value })}
                                onSecret={(secret) => setSecrets({ ...secrets, [field.id]: secret })}
                            />
                        ))}
                    </Group>
                ))}
                {fileFields && form.fileSaved && (
                    <Muted>Library and record values are saved together as a Config.toml file. Saving any of them replaces that file.</Muted>
                )}
                {error && <ErrorText>{error}</ErrorText>}
            </PopupContent>
            <PopupFooter>
                <Button appearance="secondary" disabled={submitting} onClick={onCancel}>Cancel</Button>
                <Button appearance="primary" disabled={submitting} onClick={() => submit()}>{submitting ? busyLabel : submitLabel}</Button>
            </PopupFooter>
        </>
    );
}

function TargetSummary({ target }: { target: AgentManagerDeployTarget }) {
    return (
        <Summary>
            <SummaryRow><Codicon name="github" sx={{ fontSize: 12 }} />{target.repository} · {target.branch}</SummaryRow>
            <SummaryRow><Codicon name="folder" sx={{ fontSize: 12 }} />Project: {target.project}{target.existing && " · Updates the existing agent"}</SummaryRow>
            <SummaryRow><Codicon name="telescope" sx={{ fontSize: 12 }} />Auto-instrumentation {target.tracing ? "on" : "off"}</SummaryRow>
        </Summary>
    );
}

interface ConfigFieldInputProps {
    field: AgentManagerConfigField;
    value: string;
    secret: boolean;
    onValue: (value: string) => void;
    onSecret: (secret: boolean) => void;
}

function ConfigFieldInput({ field, value, secret, onValue, onSecret }: ConfigFieldInputProps) {
    const [visible, setVisible] = useState(false);
    const label = `${field.label}${field.required ? " *" : ""}`;
    if (field.unsupported) {
        return (
            <Group>
                <span>{label}</span>
                <Muted>{field.type} · {field.unsupported}</Muted>
            </Group>
        );
    }
    return (
        <Group>
            <ConfigField
                variable={{ name: label, type: field.type, secret }}
                value={value}
                placeholder={placeholder(field)}
                isVisible={visible}
                onToggleVisibility={() => setVisible(!visible)}
                onChange={(_, next) => onValue(next)}
                onKeyDown={() => undefined}
            />
            <CheckBox checked={secret} onChange={onSecret} label="Store as a secret" />
        </Group>
    );
}
