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

import React, { useState, useEffect, useCallback, useRef } from "react";
import styled from "@emotion/styled";
import { Button, Codicon, ThemeColors } from "@wso2/ui-toolkit";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { ConfigurationCollectorMetadata, ManagedConnectionGroup, ParentPopupData } from "@wso2/ballerina-core";
import {
    PopupOverlay,
    PopupContainer,
    PopupHeader,
    HeaderTitleContainer,
    PopupTitle,
    PopupSubtitle,
    CloseButton,
    PopupContent,
    PopupFooter,
} from "../../../BI/Connection/styles";

// ─── Styled components ────────────────────────────────────────────────────────

const FormSection = styled.div`
    display: flex;
    flex-direction: column;
    gap: 16px;
`;

const ConfigurationField = styled.div`
    display: flex;
    flex-direction: column;
    gap: 6px;
`;

const FieldLabel = styled.label`
    font-size: 13px;
    font-weight: 500;
    color: ${ThemeColors.ON_SURFACE};
    display: flex;
    align-items: center;
    gap: 4px;
`;

const FieldDescription = styled.span`
    font-size: 12px;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    font-style: italic;
    font-weight: normal;
`;

const FieldInputWrapper = styled.div`
    position: relative;
    display: flex;
    align-items: center;
`;

const FieldInput = styled.input<{ hasError: boolean; hasToggle?: boolean }>`
    width: 100%;
    padding: 10px ${(props: { hasError: boolean; hasToggle?: boolean }) => props.hasToggle ? "36px" : "12px"} 10px 12px;
    background-color: ${ThemeColors.SURFACE_DIM};
    color: ${ThemeColors.ON_SURFACE};
    border: 1px solid ${(props: { hasError: boolean; hasToggle?: boolean }) =>
        props.hasError ? ThemeColors.ERROR : ThemeColors.OUTLINE_VARIANT};
    border-radius: 6px;
    font-size: 13px;
    box-sizing: border-box;

    &:focus {
        outline: none;
        border-color: ${ThemeColors.PRIMARY};
    }

    &::placeholder {
        color: ${ThemeColors.ON_SURFACE_VARIANT};
    }
`;

const FieldSelect = styled.select<{ hasError: boolean }>`
    width: 100%;
    padding: 10px 12px;
    background-color: ${ThemeColors.SURFACE_DIM};
    color: ${ThemeColors.ON_SURFACE};
    border: 1px solid ${(props: { hasError: boolean }) =>
        props.hasError ? ThemeColors.ERROR : ThemeColors.OUTLINE_VARIANT};
    border-radius: 6px;
    font-size: 13px;
    box-sizing: border-box;
    cursor: pointer;

    &:focus {
        outline: none;
        border-color: ${ThemeColors.PRIMARY};
    }
`;

const ToggleVisibilityButton = styled.button`
    position: absolute;
    right: 8px;
    background: none;
    border: none;
    padding: 2px;
    cursor: pointer;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    display: flex;
    align-items: center;

    &:hover {
        color: ${ThemeColors.ON_SURFACE};
    }
`;

const FieldError = styled.div`
    font-size: 12px;
    color: ${ThemeColors.ERROR};
`;

const ConfirmBar = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 20px;
    background-color: ${ThemeColors.SURFACE_DIM};
    border-top: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    font-size: 12px;
    line-height: 1.4;
`;

const ConfirmBarIcon = styled.span`
    flex-shrink: 0;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    display: inline-flex;
    align-items: center;
`;

const ErrorBar = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 20px;
    background-color: ${ThemeColors.SURFACE_DIM};
    border-top: 1px solid ${ThemeColors.ERROR};
    color: ${ThemeColors.ERROR};
    font-size: 12px;
    line-height: 1.4;
`;

const ErrorBarIcon = styled.span`
    flex-shrink: 0;
    color: ${ThemeColors.ERROR};
    display: inline-flex;
    align-items: center;
`;

const FooterHint = styled.span`
    margin-right: auto;
    align-self: center;
    font-size: 12px;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
`;

const ActionButton = styled(Button)``;

// One managed group per card: the Connect action, then the configurables it fills.
const GroupCard = styled.div`
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
    padding: 16px;
    border: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    border-radius: 8px;
`;

const ManagedAction = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 4px 0;
`;

// Holds the glyph outside the Button's slot — a Codicon there renders in a 14px box around a
// 16px glyph and overlaps the label.
const ManagedNote = styled.div<{ connected: boolean }>`
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    text-align: center;
    color: ${(props: { connected: boolean }) =>
        props.connected ? ThemeColors.PRIMARY : ThemeColors.ON_SURFACE_VARIANT};
`;

const ConnectionErrorText = styled.div`
    font-size: 12px;
    color: ${ThemeColors.ERROR};
    text-align: center;
`;

const Divider = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    font-size: 12px;

    &::before,
    &::after {
        content: "";
        flex: 1;
        border-bottom: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    }
`;

const GroupFields = styled.div`
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: 100%;
`;

const LoadingContainer = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 40px;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
`;

// ─── Field type config (single source of truth) ───────────────────────────────
//
// To add a new Ballerina type: add an entry here. No other code needs to change.

type InputKind = "text" | "number" | "select";

interface SelectOption {
    label: string;
    value: string;
}

interface FieldConfig {
    inputKind: InputKind;
    placeholder?: string;
    selectOptions?: SelectOption[];
    defaultValue?: string;
    validate: (value: string) => string | null;
}

const NUMERIC_INT_TYPES = new Set(["int", "byte"]);
const NUMERIC_FLOAT_TYPES = new Set(["decimal", "float"]);

function getFieldConfig(type: string | undefined): FieldConfig {
    if (NUMERIC_INT_TYPES.has(type ?? "")) {
        return {
            inputKind: "number",
            placeholder: "Enter integer",
            validate: (v) => {
                if (!v.trim()) return null;
                if (isNaN(parseInt(v, 10)) || !Number.isInteger(parseFloat(v))) return "Enter a valid integer";
                return null;
            },
        };
    }
    if (NUMERIC_FLOAT_TYPES.has(type ?? "")) {
        return {
            inputKind: "number",
            placeholder: "Enter number",
            validate: (v) => {
                if (!v.trim()) return null;
                if (isNaN(parseFloat(v))) return "Enter a valid number";
                return null;
            },
        };
    }
    if (type === "boolean") {
        return {
            inputKind: "select",
            defaultValue: "true",
            selectOptions: [
                { label: "true", value: "true" },
                { label: "false", value: "false" },
            ],
            validate: () => null, // select always holds a valid option
        };
    }
    // Default: string, records, arrays, maps, or any unknown LS type
    return {
        inputKind: "text",
        placeholder: "Enter value",
        validate: () => null,
    };
}

function isPlaceholderValue(value: string | undefined | null): boolean {
    return typeof value === "string" && /^\$\{[^}]+\}$/.test(value);
}

// Providers arrive as catalog slugs ("google-sheets"). Done in JS, not `text-transform`, because
// the label sits in a web-component slot and capitalize would mangle "GitHub".
function formatVendor(vendor: string): string {
    return vendor
        .split(/[-_.\s]+/)
        .filter(Boolean)
        .map((word) => (word === word.toLowerCase() ? word.charAt(0).toUpperCase() + word.slice(1) : word))
        .join(" ");
}

function getEmptyFieldNames(
    variables: { name: string }[] | undefined,
    values: Record<string, string>
): string[] {
    if (!variables) return [];
    return variables.filter(v => !values[v.name] || !values[v.name].trim()).map(v => v.name);
}

// ─── ConfigField sub-component ────────────────────────────────────────────────

interface ConfigFieldProps {
    variable: { name: string; description?: string; type?: string; secret?: boolean };
    value: string;
    error?: string;
    isVisible: boolean;
    onToggleVisibility: () => void;
    onChange: (name: string, value: string) => void;
    onKeyDown: (e: React.KeyboardEvent) => void;
}

const ConfigField: React.FC<ConfigFieldProps> = ({
    variable, value, error, isVisible, onToggleVisibility, onChange, onKeyDown,
}) => {
    const config = getFieldConfig(variable.type);
    const isSecret = variable.secret === true;

    const renderInput = () => {
        if (!isSecret && config.inputKind === "select") {
            return (
                <FieldSelect
                    hasError={!!error}
                    value={value}
                    onChange={(e) => onChange(variable.name, e.target.value)}
                >
                    {config.selectOptions!.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                </FieldSelect>
            );
        }

        const htmlInputType = isSecret
            ? (isVisible ? "text" : "password")
            : config.inputKind;

        return (
            <FieldInputWrapper>
                <FieldInput
                    type={htmlInputType}
                    placeholder={config.placeholder}
                    value={value}
                    onChange={(e) => onChange(variable.name, e.target.value)}
                    onKeyDown={onKeyDown}
                    hasError={!!error}
                    hasToggle={isSecret}
                />
                {isSecret && (
                    <ToggleVisibilityButton
                        type="button"
                        onClick={onToggleVisibility}
                        title={isVisible ? "Hide value" : "Show value"}
                    >
                        <Codicon name={isVisible ? "eye-closed" : "eye"} />
                    </ToggleVisibilityButton>
                )}
            </FieldInputWrapper>
        );
    };

    return (
        <ConfigurationField>
            <FieldLabel>
                {variable.name}
                {variable.description && (
                    <FieldDescription>- {variable.description}</FieldDescription>
                )}
            </FieldLabel>
            {renderInput()}
            {error && <FieldError>{error}</FieldError>}
        </ConfigurationField>
    );
};

// ─── ConfigurationCollector ───────────────────────────────────────────────────

interface ConfigurationCollectorProps {
    data?: ConfigurationCollectorMetadata;
    onClose: (parent?: ParentPopupData) => void;
}

function buildInitialValues(data: ConfigurationCollectorMetadata | undefined): Record<string, string> {
    const values: Record<string, string> = { ...(data?.existingValues ?? {}) };
    // Hide `${VAR}` env-var placeholders so the input renders blank; the user can re-enter or leave skipped.
    for (const name of Object.keys(values)) {
        if (isPlaceholderValue(values[name])) {
            values[name] = "";
        }
    }
    data?.variables?.forEach((v) => {
        const config = getFieldConfig(v.type);
        if (!(v.name in values) && config.defaultValue !== undefined) {
            values[v.name] = config.defaultValue;
        }
    });
    return values;
}

type CollectorMode = "editing" | "confirming" | "processing";

export const ConfigurationCollector: React.FC<ConfigurationCollectorProps> = ({ data, onClose }) => {
    const { rpcClient } = useRpcContext();
    const [configValues, setConfigValues] = useState<Record<string, string>>(buildInitialValues(data));
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [mode, setMode] = useState<CollectorMode>("editing");
    const [visibleFields, setVisibleFields] = useState<Record<string, boolean>>({});
    const [submitError, setSubmitError] = useState<string | null>(null);
    // Every write replaces the whole entry, so loading/connected/error never disagree.
    const [connectionState, setConnectionState] = useState<Record<string, { loading: boolean; connected?: boolean; error?: string }>>({});
    // Bumped by cancel or a new attempt, so an in-flight attempt can tell its result is no longer
    // wanted — a cancelled attempt still resolves, as a failure the user didn't cause.
    const connectionRunId = useRef(0);
    // `data` is rebuilt on every visualizer-location fetch, so only requestId tells a new request
    // apart from a refetch of the same one.
    const shownRequestId = useRef(data?.requestId);

    useEffect(() => {
        setConfigValues(buildInitialValues(data));
        setVisibleFields({});
        setErrors({});
        setMode("editing");
        setSubmitError(null);
        setConnectionState({});
        // A new request invalidates any in-flight connect from the previous one, so its result
        // cannot write stale credentials into this form.
        if (data?.requestId !== shownRequestId.current) {
            shownRequestId.current = data?.requestId;
            connectionRunId.current++;
        }
    }, [data]);

    // Takes the group, not a key: `vendor` is not unique across groups, so looking up by vendor
    // would fill the wrong client's fields. All per-group state is keyed by `group.id`.
    const handleConnect = useCallback(async (group: ManagedConnectionGroup) => {
        const runId = ++connectionRunId.current;
        setConnectionState((prev) => ({ ...prev, [group.id]: { loading: true } }));

        try {
            const response = await rpcClient.getAiPanelRpcClient().createManagedConnection({
                vendor: group.vendor,
                authType: group.authType,
            });

            // Superseded by a cancel or a newer attempt — drop this result entirely rather
            // than filling fields or reporting a failure the user already walked away from.
            if (connectionRunId.current !== runId) { return; }

            if (response.success && response.credentials) {
                // Functional update: the consent round-trip takes minutes, so a snapshot from
                // click time would silently revert any edits made meanwhile.
                setConfigValues((prev) => {
                    const next = { ...prev };
                    for (const variable of group.variables) {
                        const value = response.credentials[variable.credentialField];
                        if (value) {
                            next[variable.name] = value;
                        }
                    }
                    // The proxy /token endpoint, returned per connection. Refresh grant only.
                    if (group.refreshUrlVar && response.credentials.refreshUrl) {
                        next[group.refreshUrlVar] = response.credentials.refreshUrl;
                    }
                    return next;
                });
                setErrors((prev) => {
                    const next = { ...prev };
                    for (const variable of group.variables) {
                        delete next[variable.name];
                    }
                    if (group.refreshUrlVar) {
                        delete next[group.refreshUrlVar];
                    }
                    return next;
                });
                setMode((current) => (current === "confirming" ? "editing" : current));
                setSubmitError(null);
                setConnectionState((prev) => ({ ...prev, [group.id]: { loading: false, connected: true } }));
            } else {
                setConnectionState((prev) => ({
                    ...prev,
                    [group.id]: { loading: false, error: response.error || "Could not create the managed connection." },
                }));
            }
        } catch (error: any) {
            if (connectionRunId.current !== runId) { return; }
            setConnectionState((prev) => ({
                ...prev,
                [group.id]: { loading: false, error: error.message || "Could not create the managed connection." },
            }));
        }
    }, [rpcClient]);

    // Invalidate the run id first so the abandoned attempt returns to an already-reset card
    // instead of flashing an error.
    const handleCancelConnect = useCallback((group: ManagedConnectionGroup) => {
        connectionRunId.current++;
        setConnectionState((prev) => ({ ...prev, [group.id]: { loading: false } }));
        rpcClient.getAiPanelRpcClient().cancelManagedConnection();
    }, [rpcClient]);

    const handleInputChange = (variableName: string, value: string) => {
        setConfigValues((prev) => ({ ...prev, [variableName]: value }));
        setErrors((prev) => {
            const next = { ...prev };
            delete next[variableName];
            return next;
        });
        // Any edit invalidates the empty-fields warning; re-evaluate on next Save.
        setMode((current) => (current === "confirming" ? "editing" : current));
        setSubmitError(null);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && mode !== "processing") {
            handleSubmit();
        }
    };

    const validateConfiguration = (): boolean => {
        const newErrors: Record<string, string> = {};
        data?.variables?.forEach((variable) => {
            const error = getFieldConfig(variable.type).validate(configValues[variable.name] ?? "");
            if (error) newErrors[variable.name] = error;
        });
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const submitToBackend = async () => {
        if (!data) return;
        setSubmitError(null);
        setMode("processing");
        try {
            await rpcClient.getAiPanelRpcClient().provideConfiguration({
                requestId: data.requestId,
                configValues: configValues,
            });
            onClose();
        } catch (error: any) {
            console.error("[ConfigurationCollector] Error in submitToBackend:", error);
            const message = (error && typeof error.message === "string" && error.message) || "Failed to save configuration. Please try again.";
            setSubmitError(message);
            setMode("editing");
        }
    };

    const handleSubmit = async () => {
        if (!data || mode === "processing") return;

        if (!validateConfiguration()) {
            return;
        }

        // From confirming, Save anyway commits.
        if (mode === "confirming") {
            await submitToBackend();
            return;
        }

        // From editing, show confirm step when any required-by-user value is blank.
        const emptyNames = getEmptyFieldNames(data.variables, configValues);
        if (emptyNames.length > 0) {
            setMode("confirming");
            return;
        }

        await submitToBackend();
    };

    const handleCancel = async () => {
        if (!data) {
            onClose();
            return;
        }
        try {
            await rpcClient.getAiPanelRpcClient().cancelConfiguration({
                requestId: data.requestId,
            });
        } catch (error: any) {
            console.error("[ConfigurationCollector] Error in handleCancel:", error);
        }
        onClose();
    };

    const handleGoBack = () => setMode("editing");

    const emptyNames = mode === "confirming" ? getEmptyFieldNames(data?.variables, configValues) : [];

    // Close button (X) just closes the popup without canceling configuration collection
    // User can reopen via the Configure button in the chat segment
    const handleClose = () => onClose();

    // Prevent overlay clicks from closing the popup
    const handleOverlayClick = (e: React.MouseEvent) => e.stopPropagation();

    if (!data) {
        return (
            <>
                <PopupOverlay
                    sx={{ background: `${ThemeColors.SURFACE_CONTAINER}`, opacity: `0.5` }}
                    onClose={handleOverlayClick}
                />
                <PopupContainer>
                    <LoadingContainer>Loading...</LoadingContainer>
                </PopupContainer>
            </>
        );
    }

    return (
        <>
            <PopupOverlay
                sx={{ background: `${ThemeColors.SURFACE_CONTAINER}`, opacity: `0.5` }}
                onClose={handleOverlayClick}
            />
            <PopupContainer>
                <PopupHeader>
                    <HeaderTitleContainer>
                        <PopupTitle variant="h2">
                            {data.isTestConfig ? "Configure Test Environment" : "Configure Application"}
                        </PopupTitle>
                        {data.message && <PopupSubtitle variant="body2">{data.message}</PopupSubtitle>}
                    </HeaderTitleContainer>
                    <CloseButton appearance="icon" onClick={handleClose}>
                        <Codicon name="close" />
                    </CloseButton>
                </PopupHeader>
                <PopupContent>
                    <FormSection>
                        {data.managedConnections?.map((group) => {
                            const vendorState = connectionState[group.id] || { loading: false };
                            const anyConnectionLoading = Object.values(connectionState).some((s) => s.loading);
                            const groupVarNames = new Set(group.variables.map((v) => v.name));
                            // refreshUrl is auto-filled by Connect but still user-editable, so it
                            // belongs to the group's field list.
                            const groupFields = (data.variables ?? []).filter(
                                (v) => groupVarNames.has(v.name) || v.name === group.refreshUrlVar
                            );
                            return (
                                <GroupCard key={group.id}>
                                    {/* Above the fields: Connect populates them, so below it would
                                        read as the form's submit button. */}
                                    <ManagedAction>
                                        {vendorState.loading ? (
                                            <Button
                                                appearance="secondary"
                                                onClick={() => handleCancelConnect(group)}
                                            >
                                                Cancel
                                            </Button>
                                        ) : (
                                            <Button
                                                appearance="primary"
                                                onClick={() => handleConnect(group)}
                                                disabled={anyConnectionLoading || mode === "processing"}
                                            >
                                                {`Connect ${formatVendor(group.vendor)}`}
                                            </Button>
                                        )}
                                        <ManagedNote connected={!!vendorState.connected}>
                                            <Codicon name={vendorState.connected ? "check" : "plug"} />
                                            <span>
                                                {vendorState.loading
                                                    ? "Complete the sign-in in your browser."
                                                    : vendorState.connected
                                                        ? "Connected"
                                                        : "Creates a WSO2-managed connection."}
                                            </span>
                                        </ManagedNote>
                                        {vendorState.error && (
                                            <ConnectionErrorText>{vendorState.error}</ConnectionErrorText>
                                        )}
                                    </ManagedAction>
                                    <Divider>or enter custom credentials</Divider>
                                    <GroupFields>
                                        {groupFields.map((variable) => (
                                            <ConfigField
                                                key={variable.name}
                                                variable={variable}
                                                value={configValues[variable.name] ?? ""}
                                                error={errors[variable.name]}
                                                isVisible={visibleFields[variable.name] ?? false}
                                                onToggleVisibility={() => setVisibleFields((prev) => ({ ...prev, [variable.name]: !prev[variable.name] }))}
                                                onChange={handleInputChange}
                                                onKeyDown={handleKeyDown}
                                            />
                                        ))}
                                    </GroupFields>
                                </GroupCard>
                            );
                        })}
                        {(() => {
                            const managedVarNames = new Set(
                                (data.managedConnections || []).flatMap((g) => [
                                    ...g.variables.map((v) => v.name),
                                    ...(g.refreshUrlVar ? [g.refreshUrlVar] : []),
                                ])
                            );
                            const remainingVars = data.variables?.filter((v) => !managedVarNames.has(v.name)) || [];
                            if (remainingVars.length === 0) return null;
                            return (
                                <>
                                    {data.managedConnections?.length ? <Divider>Other Configuration</Divider> : null}
                                    {remainingVars.map((variable) => (
                                        <ConfigField
                                            key={variable.name}
                                            variable={variable}
                                            value={configValues[variable.name] ?? ""}
                                            error={errors[variable.name]}
                                            isVisible={visibleFields[variable.name] ?? false}
                                            onToggleVisibility={() => setVisibleFields((prev) => ({ ...prev, [variable.name]: !prev[variable.name] }))}
                                            onChange={handleInputChange}
                                            onKeyDown={handleKeyDown}
                                        />
                                    ))}
                                </>
                            );
                        })()}
                    </FormSection>
                </PopupContent>
                {mode === "confirming" && emptyNames.length > 0 && (
                    <ConfirmBar>
                        <ConfirmBarIcon>
                            <Codicon name="warning" />
                        </ConfirmBarIcon>
                        <span>
                            Empty fields will not be saved: <b>{emptyNames.join(", ")}</b>
                        </span>
                    </ConfirmBar>
                )}
                {submitError && (
                    <ErrorBar>
                        <ErrorBarIcon>
                            <Codicon name="error" />
                        </ErrorBarIcon>
                        <span>{submitError}</span>
                    </ErrorBar>
                )}
                <PopupFooter>
                    {mode === "confirming" ? (
                        <>
                            <ActionButton appearance="secondary" onClick={handleGoBack}>
                                Go Back
                            </ActionButton>
                            <ActionButton
                                appearance="primary"
                                onClick={handleSubmit}
                                disabled={!data.variables || data.variables.length === 0}
                            >
                                Save anyway
                            </ActionButton>
                        </>
                    ) : (
                        <>
                            <FooterHint>Leave any field blank to skip. You can fill it later.</FooterHint>
                            <ActionButton appearance="secondary" onClick={handleCancel} disabled={mode === "processing"}>
                                Skip
                            </ActionButton>
                            <ActionButton
                                appearance="primary"
                                onClick={handleSubmit}
                                disabled={mode === "processing" || !data.variables || data.variables.length === 0}
                            >
                                {mode === "processing" ? "Saving..." : "Save Configuration"}
                            </ActionButton>
                        </>
                    )}
                </PopupFooter>
            </PopupContainer>
        </>
    );
};

export default ConfigurationCollector;
