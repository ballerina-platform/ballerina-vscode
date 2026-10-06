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
import { AgentManagerConfigField, AgentManagerConfigForm as ConfigFormData } from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { Button, CheckBox, ProgressRing } from "@wso2/ui-toolkit";
import { PopupContent, PopupFooter } from "../../views/BI/Connection/styles";
import { ConfigField } from "../../views/AIPanel/components/ConfigurationCollector";

export const Group = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
`;

export const GroupTitle = styled.span`
    font-weight: 600;
`;

export const Muted = styled.span`
    color: var(--vscode-descriptionForeground);
    font-size: 12px;
`;

export const Summary = styled.dl`
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 10px 24px;
    margin: 0;
    font-size: 13px;
`;

export const Label = styled.dt`
    color: var(--vscode-descriptionForeground);
`;

export const Value = styled.dd`
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    min-width: 0;
    margin: 0;
    overflow-wrap: anywhere;
`;

export const Pill = styled.span`
    padding: 1px 8px;
    border: 1px solid var(--vscode-welcomePage-tileBorder);
    border-radius: 10px;
    font-size: 12px;
`;

export const Section = styled.div`
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding-top: 16px;
    border-top: 1px solid var(--vscode-welcomePage-tileBorder);
`;

export const Loading = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 160px;
    padding: 32px 0;
`;

export const ErrorText = styled.span`
    color: var(--vscode-errorForeground);
    word-break: break-word;
`;

interface AgentManagerConfigFormProps {
    projectPath: string;
    description: string;
    action: "saveConfig";
    submitLabel: string;
    busyLabel: string;
    onDone: () => void;
    onCancel: () => void;
}

export function groupFields(fields: AgentManagerConfigField[]): [string, AgentManagerConfigField[]][] {
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

export function AgentManagerConfigForm({ projectPath, description, action, submitLabel, busyLabel, onDone, onCancel }: AgentManagerConfigFormProps) {
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
        });
    }, [projectPath]);

    if (!form) {
        return <PopupContent><Loading><ProgressRing /></Loading></PopupContent>;
    }
    const fileFields = form.fields.some((f) => f.target === "file" && !f.unsupported);
    return (
        <>
            <PopupContent>
                {form.error && <ErrorText>Couldn't read this agent's configurables: {form.error}</ErrorText>}
                {form.fields.length > 0 && (
                    <Section>
                        <GroupTitle>Configurables</GroupTitle>
                        <Muted>{description}</Muted>
                    </Section>
                )}
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

interface ConfigFieldInputProps {
    field: AgentManagerConfigField;
    value: string;
    secret: boolean;
    onValue: (value: string) => void;
    onSecret: (secret: boolean) => void;
}

export function ConfigFieldInput({ field, value, secret, onValue, onSecret }: ConfigFieldInputProps) {
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
