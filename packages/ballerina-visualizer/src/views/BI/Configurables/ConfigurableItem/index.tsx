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

import React, { ReactNode, useState, useEffect, useRef, useCallback } from "react";
import styled from "@emotion/styled";
import { ConfigVariable, getPrimaryInputType } from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { Button, Codicon } from "@wso2/ui-toolkit";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import { VSCodeTextArea } from "@vscode/webview-ui-toolkit/react";
import EditForm from "../EditConfigurableVariables";
import ConfigObjectEditor from "./ConfigObjectEditor";
import { getConfigurableErrorMessages, getTomlPlaceholder, isTomlStringType, shouldQuoteTomlStringValue, validateTomlValue } from "./utils";

const Container = styled.div`
    padding: 12px 14px 18px;
    &:hover {
        background-color: var(--vscode-settings-rowHoverBackground);
        
        .action-button-container {
            display: block !important;
        }
    }
`;

const ConfigNameTitle = styled.div`
    font-size: 13px;
    font-weight: 700;
    height: 20px;
    color: var(--vscode-settings-headerForeground);
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 5px;
`;

const ButtonWrapper = styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
    flex-direction: row;
    font-size: 10px;
    width: auto;
    margin-left: 15px;
`;

const ConfigValueField = styled.div`
    display: flex;
`;

const Overlay = styled.div`
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: var(--vscode-settings-rowHoverBackground);
    z-index: 1000;
`;

export interface SidePanelProps {
    id?: string;
    className?: string;
    isOpen?: boolean;
    overlay?: boolean;
    children?: React.ReactNode;
    alignment?: "left" | "right";
    width?: number;
    sx?: any;
    onClose?: (event?: React.MouseEvent<HTMLElement, MouseEvent>) => void;
    subPanel?: ReactNode;
    subPanelWidth?: number;
    isSubPanelOpen?: boolean;
}

interface ConfigurableItemProps {
    variable: ConfigVariable;
    integrationCategory: string;
    packageName: string;
    moduleName: string;
    index: number;
    fileName: string;
    isTestsContext?: boolean;
    onDeleteConfigVariable?: (index: number) => void;
    onFormSubmit: () => void;
    updateErrorMessage: (message: string) => void;
}

export function ConfigurableItem(props: ConfigurableItemProps) {
    const {
        variable,
        integrationCategory,
        packageName,
        moduleName,
        index,
        fileName,
        onDeleteConfigVariable,
        onFormSubmit,
        updateErrorMessage
    } = props;
    const { rpcClient } = useRpcContext();
    const [configVariable, setConfigVariable] = useState<ConfigVariable>(variable);
    const [isEditConfigVariableFormOpen, setEditConfigVariableFormOpen] = useState<boolean>(false);
    const [isUpdating, setIsUpdating] = useState<boolean>(false);
    const [validationError, setValidationError] = useState<string>('');
    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const activeValueKey = props.isTestsContext ? 'testConfigValue' : 'configValue';

    // Refs used to keep the typing UX glitch-free when the parent re-fetches
    // config variables while the user is still editing:
    // - configVariableRef: always holds the freshest local snapshot so the
    //   debounced RPC sends the latest typed value (not a stale closure).
    // - latestValueRef: the most recent value the user typed (already wrapped
    //   in quotes for strings). Used to decide when dirty can be cleared.
    // - isDirtyRef: true while there are local edits not yet acknowledged by
    //   the server. While dirty, we ignore prop updates so external refetches
    //   cannot overwrite in-progress keystrokes.
    // - requestIdRef: monotonic counter to ignore out-of-order RPC responses.
    const configVariableRef = useRef<ConfigVariable>(variable);
    const latestValueRef = useRef<string | null>(null);
    const isDirtyRef = useRef<boolean>(false);
    const requestIdRef = useRef<number>(0);

    useEffect(() => {
        configVariableRef.current = configVariable;
    }, [configVariable]);

    useEffect(() => {
        // Skip syncing from props while the user has pending local edits.
        // Otherwise an external refetch (e.g. triggered by our own RPC writing
        // the Config.toml and firing onProjectContentUpdated) would overwrite
        // newer keystrokes and cause the visible "revert to old value" glitch.
        if (isDirtyRef.current) {
            return;
        }
        setConfigVariable(variable);
        setValidationError(validateTomlValue(
            variable?.properties?.[activeValueKey]?.value ? String(variable.properties[activeValueKey].value) : '',
            String(variable?.properties?.type?.value || '')
        ));
    }, [variable, activeValueKey]);

    useEffect(() => {
        return () => {
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
            }
        };
    }, []);

    const handleEditConfigVariableFormOpen = () => {
        setEditConfigVariableFormOpen(true);
    };

    const getValidationError = (value: string) => {
        return validateTomlValue(value, String(configVariable.properties?.type?.value || ''));
    }

    const handleTextAreaChange = (value: any) => {
        if (shouldQuoteTomlStringValue(String(value), String(configVariable.properties?.type?.value || ''))) {
            value = `"${value}"`;
        }

        const currentValidationError = getValidationError(value);
        setValidationError(currentValidationError);
        latestValueRef.current = value;
        isDirtyRef.current = true;

        setConfigVariable(prevState => ({
            ...prevState,
            properties: {
                ...prevState.properties,
                [activeValueKey]: {
                    ...prevState.properties[activeValueKey],
                    value: value
                }
            }
        }));

        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
        }
        if (currentValidationError) {
            return;
        }
        debounceTimerRef.current = setTimeout(() => {
            debounceTimerRef.current = null;
            // Always send the latest typed value via ref, not the stale
            // closure value, so fast/slow typing or quick edits converge
            // to the correct final value on the backend.
            if (latestValueRef.current !== null) {
                sendConfigUpdate(latestValueRef.current);
            }
        }, 1000);
    }

    const handleTextAreaBlur = () => {
        // On blur, flush any pending debounced update immediately so the
        // backend converges without waiting for the debounce window.
        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
            debounceTimerRef.current = null;
            if (latestValueRef.current !== null) {
                const currentValidationError = getValidationError(latestValueRef.current);
                setValidationError(currentValidationError);
                if (currentValidationError) {
                    return;
                }
                sendConfigUpdate(latestValueRef.current);
            }
        }
    }

    const getPlainValue = (value: string) => {
        if (isTomlStringType(String(configVariable.properties?.type?.value || '')) && /^".*"$/.test(value)) {
            return value.replace(/^"|"$/g, '');
        }
        return value;
    }

    const sendConfigUpdate = useCallback(async (newValue: string) => {
        const requestId = ++requestIdRef.current;
        const prevNode = configVariableRef.current;
        setIsUpdating(true);
        try {
            const newConfigVarNode: ConfigVariable = {
                ...prevNode,
                properties: {
                    ...prevNode.properties,
                    [activeValueKey]: {
                        ...prevNode.properties[activeValueKey],
                        value: newValue,
                        modified: true
                    }
                }
            };

            const response = await rpcClient.getBIDiagramRpcClient().updateConfigVariablesV2({
                configFilePath: fileName,
                configVariable: newConfigVarNode,
                packageName: packageName,
                moduleName: moduleName,
            });

            // Ignore stale responses: if a newer request was issued while this
            // one was in-flight, that newer one is the source of truth.
            if (requestId !== requestIdRef.current) {
                return;
            }

            updateErrorMessage(response?.errorMsg || '');
            const isUpdateSuccessful = !response?.errorMsg;

            // Only clear the dirty flag if nothing newer was typed AND no
            // further debounced update is scheduled. Otherwise we must stay
            // dirty so incoming prop updates don't clobber local state.
            if (
                isUpdateSuccessful &&
                debounceTimerRef.current === null &&
                latestValueRef.current === newValue
            ) {
                isDirtyRef.current = false;
                latestValueRef.current = null;
            }
        } finally {
            if (requestId === requestIdRef.current) {
                setIsUpdating(false);
            }
        }
    }, [activeValueKey, fileName, packageName, moduleName, rpcClient, updateErrorMessage]);

    const handleUpdateConfigValue = async (newValue: string) => {
        latestValueRef.current = newValue;
        isDirtyRef.current = true;
        setConfigVariable(prevState => ({
            ...prevState,
            properties: {
                ...prevState.properties,
                [activeValueKey]: {
                    ...prevState.properties[activeValueKey],
                    value: newValue
                }
            }
        }));

        await sendConfigUpdate(newValue);
    }

    const handleFormClose = () => {
        setEditConfigVariableFormOpen(false);
    };


    const sanitizeConfigValue = () => {
        const variableName = configVariable?.properties?.variable?.value;
        const configValue = configVariable?.properties?.configValue?.value;
        if (configValue && typeof configValue === 'string') {
            // Check if configValue already looks like an object or JSON (starts with '{' and ends with '}')
            const trimmed = configValue.trim();
            if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
                return trimmed;
            } else {
                // Otherwise, remove the leading "variableName = " if present
                const sanitizedConfigValue = configValue.replace(new RegExp(`^${variableName}\\s*=\\s*`, 'g'), '');
                return sanitizedConfigValue;
            }
        }
        return configValue;
    }

    const isRecordType = () => {
        if (getPrimaryInputType(configVariable?.properties?.type.types)?.typeMembers?.length > 0) {
            const recordType = getPrimaryInputType(configVariable?.properties?.type.types)?.typeMembers?.find(m => configVariable?.properties?.type?.value.toString().includes(m.type));
            return recordType?.kind === 'RECORD_TYPE';
        }
        return false;
    }

    return (
        <Container id={`${String(variable?.properties?.variable?.value)}-variable`}>
            {isEditConfigVariableFormOpen && <Overlay data-testid="config-overlay" />}
            <ConfigNameTitle>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    {
                        typeof configVariable?.properties?.variable?.value === 'string' ?
                            configVariable?.properties?.variable?.value : ''
                    }:
                    <span
                        style={{
                            paddingLeft: '5px',
                            fontWeight: 500,
                            color: 'var(--vscode-foreground)'
                        }}>
                        {String(configVariable?.properties?.type?.value)}
                    </span>
                    {configVariable?.properties?.defaultValue?.value && <span
                        className="default-value-container"
                        style={{
                            paddingLeft: '5px',
                            fontWeight: 200,
                            fontSize: '12px',
                            fontStyle: 'italic'
                        }}>
                        {configVariable?.properties?.defaultValue?.value &&
                            ` (Defaults to: ${String(configVariable?.properties?.defaultValue?.value)})`}
                    </span>}
                    {(!configVariable?.properties?.defaultValue?.value &&
                        !configVariable?.properties?.[activeValueKey]?.value) && (
                            // Warning icon if no value is configured
                            <ButtonWrapper>
                                <Button
                                    appearance="icon"
                                    buttonSx={{
                                        background: "transparent"
                                    }}
                                >
                                    <Codicon
                                        name="warning"
                                        sx={{
                                            paddingTop: '2px',
                                            color: 'var(--vscode-editorWarning-foreground)'
                                        }}
                                        iconSx={{ font: "normal normal normal 13px/1 codicon" }}
                                    />
                                </Button>
                                <span style={{
                                    color: 'var(--vscode-editorWarning-foreground)',
                                    fontSize: '12px',
                                    whiteSpace: 'nowrap',
                                    fontWeight: 400
                                }}>
                                    Required
                                </span>
                            </ButtonWrapper>
                        )}
                </div>
                {packageName === integrationCategory && (
                    <div className="action-button-container" style={{ display: 'none' }}>
                        <div style={{ display: 'flex', gap: '5px' }}>
                            <div className="edit-icon-container">
                                <Button
                                    appearance="icon"
                                    onClick={() => handleEditConfigVariableFormOpen()}
                                    tooltip="Edit Configurable Variable"
                                >
                                    <Codicon name="edit" />
                                </Button>
                            </div>
                            <div className="delete-button-container">
                                <Button
                                    appearance="icon"
                                    onClick={() => onDeleteConfigVariable(index)}
                                    tooltip="Delete Configurable Variable"
                                >
                                    <Codicon name="trash" />
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
            </ConfigNameTitle>
            {getConfigurableErrorMessages(configVariable).map((message, errorIndex) => (
                <ButtonWrapper key={errorIndex} data-testid="configurable-error" style={{ justifyContent: "flex-start", marginLeft: 0 }}>
                    <Button
                        appearance="icon"
                        buttonSx={{
                            background: "transparent"
                        }}
                    >
                        <Codicon
                            name="error"
                            sx={{
                                paddingTop: '2px',
                                color: 'var(--vscode-errorForeground)'
                            }}
                            iconSx={{ font: "normal normal normal 13px/1 codicon" }}
                        />
                    </Button>
                    <span style={{
                        color: 'var(--vscode-errorForeground)',
                        fontSize: '12px',
                        fontWeight: 400
                    }}>
                        {message}
                    </span>
                </ButtonWrapper>
            ))}
            {configVariable?.properties?.documentation?.value &&
                <div
                    style={{
                        fontSize: '13px',
                        marginBottom: '10px',
                        color: 'var(--vscode-descriptionForeground)'
                    }}
                >
                    <ReactMarkdown remarkPlugins={[remarkBreaks]}>
                        {String(configVariable?.properties?.documentation?.value)}
                    </ReactMarkdown>
                </div>
            }
            <ConfigValueField>
                {isRecordType() && <ConfigObjectEditor
                    fileName={fileName}
                    configValue={sanitizeConfigValue()}
                    typeValue={configVariable?.properties?.type}
                    onChange={(newValue: string) => handleUpdateConfigValue(newValue)}
                />}
                {!isRecordType() && <div style={{ position: 'relative', width: '100%', maxWidth: '350px' }}>
                    <VSCodeTextArea
                        name={`${String(variable?.properties?.variable?.value)}-config-value`}
                        rows={(() => {
                            const value = configVariable?.properties?.[activeValueKey]?.value
                                ? String(configVariable?.properties?.[activeValueKey]?.value)
                                : '';
                            if (!value) return 1;
                            return Math.min(5, Math.ceil(value.length / 100));
                        })()}
                        resize="vertical"
                        value={configVariable?.properties?.[activeValueKey]?.value ? getPlainValue(String(configVariable?.properties?.[activeValueKey]?.value)) : ''}
                        placeholder={getTomlPlaceholder(
                            String(configVariable?.properties?.type?.value || ''),
                            configVariable?.properties?.defaultValue?.value
                        )}
                        style={{
                            width: '100%',
                            minHeight: '20px',
                            opacity: isUpdating ? 0.6 : 1
                        }}
                        onInput={(e: Event) => handleTextAreaChange((e.currentTarget as HTMLTextAreaElement).value)}
                        onBlur={handleTextAreaBlur}
                    >
                        <style>{`
                            vscode-text-area::part(control) {
                                padding: 5px !important;
                                min-height: 20px !important;
                        }
                        `}</style>
                    </VSCodeTextArea>
                    {validationError && (
                        <div style={{
                            color: 'var(--vscode-editorError-foreground)',
                            fontSize: '12px',
                            lineHeight: '16px',
                            marginTop: '4px'
                        }}>
                            {validationError}
                        </div>
                    )}
                    {isUpdating && (
                        <span style={{
                            position: 'absolute',
                            right: '8px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            display: 'flex',
                            alignItems: 'center'
                        }}>
                            <span
                                className="codicon codicon-loading codicon-modifier-spin"
                                style={{ fontSize: '14px', color: 'var(--vscode-descriptionForeground)' }}
                            />
                        </span>
                    )}
                </div>}
            </ConfigValueField>
            {isEditConfigVariableFormOpen &&
                <EditForm
                    isOpen={isEditConfigVariableFormOpen}
                    onClose={handleFormClose}
                    onSubmit={onFormSubmit}
                    variable={configVariable}
                    title={`Edit Configurable Variable`}
                    filename={props.fileName}
                    packageName={packageName}
                    moduleName={moduleName}
                />
            }
        </Container>
    );
}

export default ConfigurableItem;
