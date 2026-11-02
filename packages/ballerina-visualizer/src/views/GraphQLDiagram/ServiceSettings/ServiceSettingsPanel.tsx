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
import {
    EVENT_TYPE,
    NodePosition,
    ServiceSetting,
    ServiceSettingsEditResponse,
    ServiceSettingsResponse,
} from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { PanelContainer } from "@wso2/ballerina-side-panel";
import { Button, Codicon, ProgressRing } from "@wso2/ui-toolkit";
import { availableSettings, setSettings, summarize } from "./summary";
import { serviceTarget, useGraphqlContext, useInvalidateServiceSettings } from "./useServiceSettings";
import { ValueSettingEditor } from "./ValueSettingEditor";
import { RequestContextEditor } from "./RequestContextEditor";
import {
    Description,
    EmptyState,
    ErrorText,
    LinkButton,
    List,
    PanelBody,
    Row,
    RowButton,
    RowDescription,
    RowDetail,
    RowLabel,
    Section,
    SectionTitle,
} from "./styles";

interface ServiceSettingsPanelProps {
    filePath: string;
    position: NodePosition;
    settings?: ServiceSettingsResponse;
    loading: boolean;
    /** Opens a setting's editor directly, instead of the list. */
    initialField?: string;
    onClose: () => void;
    /** Opens the full service config form, for fields with no editor of their own. */
    onOpenAdvanced: () => void;
}

/**
 * The Service Settings panel: the settings set on a service, each with its own editor, and the curated settings that
 * can be added. Every change is a single-field edit, so values written by hand elsewhere in the annotation are kept.
 */
export function ServiceSettingsPanel(props: ServiceSettingsPanelProps) {
    const { filePath, position, settings, loading, initialField, onClose, onOpenAdvanced } = props;
    const { rpcClient } = useRpcContext();
    const invalidate = useInvalidateServiceSettings();
    const [editingField, setEditingField] = useState<string | undefined>(initialField);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string>();

    const allSettings = settings?.settings ?? [];
    const editing = allSettings.find((setting) => setting.field === editingField);
    const contextQuery = useGraphqlContext(filePath, position, editing?.editorKind === "contextInit");
    const target = serviceTarget(filePath, position);
    const designer = rpcClient.getServiceDesignerRpcClient();

    const closeEditor = () => {
        setEditingField(undefined);
        setError(undefined);
    };

    /** Runs an edit; on success refreshes the panel and, unless told otherwise, returns to the list. */
    const runEdit = async (edit: () => Promise<ServiceSettingsEditResponse>, stayOpen = false) => {
        setBusy(true);
        setError(undefined);
        try {
            const response = await edit();
            if (response?.errorMsg) {
                setError(response.errorMsg);
                return;
            }
            await invalidate();
            if (!stayOpen) {
                closeEditor();
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    };

    const saveValue = (field: string, value: string) =>
        runEdit(() => designer.updateServiceSetting({ ...target, field, value }));

    const removeSetting = (setting: ServiceSetting) => {
        if (setting.editorKind === "contextInit") {
            // Removing the context may also delete its function, so it is confirmed in the context editor.
            setEditingField(setting.field);
            return;
        }
        runEdit(() => designer.updateServiceSetting({ ...target, field: setting.field, value: "" }));
    };

    const openSetting = (setting: ServiceSetting) => {
        if (setting.editorKind === "advanced") {
            onOpenAdvanced();
            return;
        }
        setError(undefined);
        setEditingField(setting.field);
    };

    const openContextFunction = async () => {
        const context = contextQuery.data;
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

    const renderEditor = (setting: ServiceSetting) => {
        if (setting.editorKind === "contextInit") {
            return (
                <RequestContextEditor
                    context={contextQuery.data}
                    loading={contextQuery.isLoading}
                    busy={busy}
                    error={error ?? contextQuery.data?.errorMsg}
                    onCreate={() => runEdit(() => designer.applyGraphqlContext({ ...target, action: "create" }), true)}
                    onUse={(functionName) =>
                        runEdit(() => designer.applyGraphqlContext({ ...target, action: "use", functionName }), true)}
                    onRemove={(deleteFunction) =>
                        runEdit(() => designer.applyGraphqlContext({ ...target, action: "remove", deleteFunction }))}
                    onSaveEntries={(entries) =>
                        runEdit(() => designer.applyGraphqlContext({ ...target, action: "setEntries", entries }), true)}
                    onOpenFunction={openContextFunction}
                    onCancel={closeEditor}
                />
            );
        }
        return (
            <ValueSettingEditor
                key={setting.field}
                setting={setting}
                saving={busy}
                error={error}
                onSave={(value) => saveValue(setting.field, value)}
                onCancel={closeEditor}
            />
        );
    };

    const configured = setSettings(allSettings);
    const available = availableSettings(allSettings);

    return (
        <PanelContainer
            title={editing ? editing.label : "Service Settings"}
            show={true}
            onClose={onClose}
            onBack={editing ? closeEditor : undefined}
        >
            <PanelBody data-testid="service-settings-panel">
                {loading && !settings ? (
                    <ProgressRing />
                ) : settings?.errorMsg ? (
                    <ErrorText role="alert">Could not read the service settings: {settings.errorMsg}</ErrorText>
                ) : editing ? (
                    renderEditor(editing)
                ) : (
                    <>
                        <Section aria-labelledby="configured-settings-title">
                            <SectionTitle id="configured-settings-title">Configured</SectionTitle>
                            {configured.length === 0 ? (
                                <EmptyState>No settings yet. This service uses the defaults.</EmptyState>
                            ) : (
                                <List>
                                    {configured.map((setting) => (
                                        <Row key={setting.field} data-testid={`service-setting-${setting.field}`}>
                                            <RowButton
                                                onClick={() => openSetting(setting)}
                                                aria-label={`Edit ${setting.label}`}
                                            >
                                                <RowLabel>{setting.label}</RowLabel>
                                                <RowDetail title={setting.value}>{summarize(setting)}</RowDetail>
                                            </RowButton>
                                            <Button
                                                appearance="icon"
                                                tooltip={`Remove ${setting.label}`}
                                                aria-label={`Remove ${setting.label}`}
                                                disabled={busy}
                                                onClick={() => removeSetting(setting)}
                                            >
                                                <Codicon name="trash" />
                                            </Button>
                                        </Row>
                                    ))}
                                </List>
                            )}
                            {error && <ErrorText role="alert">{error}</ErrorText>}
                        </Section>
                        {available.length > 0 && (
                            <Section aria-labelledby="available-settings-title">
                                <SectionTitle id="available-settings-title">Add a setting</SectionTitle>
                                <List>
                                    {available.map((setting) => (
                                        <Row key={setting.field} data-testid={`add-service-setting-${setting.field}`}>
                                            <RowButton
                                                onClick={() => openSetting(setting)}
                                                aria-label={`Add ${setting.label}`}
                                            >
                                                <RowLabel>{setting.label}</RowLabel>
                                                {setting.description && (
                                                    <RowDescription>{setting.description}</RowDescription>
                                                )}
                                            </RowButton>
                                            <Codicon name="add" />
                                        </Row>
                                    ))}
                                </List>
                            </Section>
                        )}
                        <Description>
                            Need another field?{" "}
                            <LinkButton onClick={onOpenAdvanced} data-testid="service-settings-advanced">
                                Edit all fields
                            </LinkButton>
                        </Description>
                    </>
                )}
            </PanelBody>
        </PanelContainer>
    );
}
