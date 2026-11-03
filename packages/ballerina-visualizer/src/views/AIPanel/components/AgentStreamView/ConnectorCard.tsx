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

import styled from "@emotion/styled";
import React, { useState } from "react";
import {
    InlineButton,
    InlineCard,
    InlineCardHeader,
    InlineCardIcon,
    InlineCardSubtitle,
    InlineCardTitle,
    InlineDetailLabel,
    InlineDetailRow,
    InlineDetailValue,
    InlineDetailsBlock,
    InlineErrorText,
    InlineInput,
    InlineStatusRow,
    InlineTab,
    InlineTabRow,
    InlineUrlInput,
    InlineUrlRow,
} from "./styles";

// ── ConnectorCard-specific styled components ──────────────────────────────────

const UploadZone = styled.label<{ disabled?: boolean }>`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 5px;
    padding: 14px 10px;
    margin: 2px 0 4px;
    border: 1.5px dashed var(--vscode-panel-border);
    border-radius: 4px;
    cursor: ${(props: { disabled?: boolean }) => props.disabled ? "not-allowed" : "pointer"};
    opacity: ${(props: { disabled?: boolean }) => props.disabled ? 0.45 : 1};
    color: var(--vscode-descriptionForeground);
    transition: border-color 0.15s ease, background-color 0.15s ease;
    &:hover {
        border-color: ${(props: { disabled?: boolean }) => props.disabled ? "var(--vscode-panel-border)" : "var(--vscode-focusBorder)"};
        background-color: ${(props: { disabled?: boolean }) => props.disabled ? "transparent" : "var(--vscode-toolbar-hoverBackground, rgba(127,127,127,0.07))"};
    }
`;

const UploadZoneIcon = styled.span`
    font-size: 18px;
    color: var(--vscode-descriptionForeground);
    opacity: 0.7;
`;

const UploadZoneText = styled.span`
    font-size: 12px;
    font-family: var(--vscode-font-family);
    color: var(--vscode-descriptionForeground);
    text-align: center;
`;

const UploadZoneHint = styled.span`
    font-size: 11px;
    font-family: var(--vscode-font-family);
    color: var(--vscode-descriptionForeground);
    opacity: 0.6;
`;

const SkipRow = styled.div`
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
    margin-top: 6px;
    padding-top: 6px;
    border-top: 1px solid var(--vscode-panel-border);
`;

const SkipWarning = styled.span`
    font-size: 11px;
    font-family: var(--vscode-font-family);
    color: var(--vscode-descriptionForeground);
    flex: 1;
    opacity: 0.8;
`;

// ── ConnectorCard ─────────────────────────────────────────────────────────────

interface ConnectorCardProps {
    data: Record<string, any>;
    rpcClient: any;
}

const ConnectorCard: React.FC<ConnectorCardProps> = ({ data, rpcClient }) => {
    const stage: string = data.stage;
    const isService = data.mode === "service";
    const [inputMethod, setInputMethod] = useState<"file" | "paste" | "url">("file");
    const [specContent, setSpecContent] = useState("");
    const [specUrl, setSpecUrl] = useState("");
    const [isProcessing, setIsProcessing] = useState(false);
    const [validationError, setValidationError] = useState<string | null>(null);
    const [showSkipConfirm, setShowSkipConfirm] = useState(false);

    const validateSpec = (content: string): string | null => {
        if (!content.trim()) return "Specification content cannot be empty";
        try { JSON.parse(content); return null; } catch { /* fall through */ }
        if (content.includes("openapi:") || content.includes("swagger:")) return null;
        return "Content must be valid JSON or YAML (OpenAPI/Swagger)";
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setValidationError(null);
        const reader = new FileReader();
        reader.onload = async (ev) => {
            const content = ev.target?.result as string;
            const err = validateSpec(content);
            if (err) { setValidationError(err); return; }
            await submit(content);
        };
        reader.readAsText(file);
    };

    const submit = async (spec: string) => {
        setIsProcessing(true);
        try {
            await rpcClient?.getAiPanelRpcClient().provideConnectorSpec({ requestId: data.requestId, spec });
        } catch (e: any) {
            setValidationError(e.message || "Failed to submit specification");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleSubmitPaste = async () => {
        const err = validateSpec(specContent);
        if (err) { setValidationError(err); return; }
        setValidationError(null);
        await submit(specContent);
    };

    const handleSubmitUrl = async () => {
        setValidationError(null);
        setIsProcessing(true);
        try {
            const res = await fetch(specUrl);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const text = await res.text();
            const err = validateSpec(text);
            if (err) throw new Error(err);
            await submit(text);
        } catch (e: any) {
            setValidationError(e.message || "Failed to fetch specification");
            setIsProcessing(false);
        }
    };

    const handleSkip = async () => {
        try {
            await rpcClient?.getAiPanelRpcClient().cancelConnectorSpec({ requestId: data.requestId });
        } catch (e) {
            console.error("[ConnectorCard] skip error:", e);
        }
        setShowSkipConfirm(false);
    };

    if (stage === "requesting_input") {
        return (
            <InlineCard>
                <InlineCardHeader>
                    <InlineCardIcon><span className="codicon codicon-plug" /></InlineCardIcon>
                    <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
                        <InlineCardTitle>
                            {isService ? "Generate Service" : "Generate Connector"}{data.serviceName ? `: ${data.serviceName}` : ""}
                        </InlineCardTitle>
                        {data.serviceDescription && (
                            <InlineCardSubtitle>{data.serviceDescription}</InlineCardSubtitle>
                        )}
                    </div>
                </InlineCardHeader>

                {data.reason && (
                    <InlineErrorText>Couldn't use the spec you supplied: {data.reason}</InlineErrorText>
                )}

                <InlineTabRow>
                    {(["file", "url", "paste"] as const).map(m => (
                        <InlineTab
                            key={m}
                            active={inputMethod === m}
                            onClick={() => { setInputMethod(m); setValidationError(null); }}
                        >
                            {m === "file" ? "Upload File" : m === "url" ? "From URL" : "Paste Spec"}
                        </InlineTab>
                    ))}
                </InlineTabRow>

                {inputMethod === "file" && (
                    <>
                        <UploadZone disabled={isProcessing}>
                            <input
                                type="file"
                                accept=".json,.yaml,.yml"
                                style={{ display: "none" }}
                                onChange={handleFileUpload}
                                disabled={isProcessing}
                            />
                            <UploadZoneIcon>
                                <span className={`codicon ${isProcessing ? "codicon-loading codicon-modifier-spin" : "codicon-cloud-upload"}`} />
                            </UploadZoneIcon>
                            <UploadZoneText>
                                {isProcessing ? "Processing..." : "Click to choose a spec file"}
                            </UploadZoneText>
                            <UploadZoneHint>.json, .yaml, .yml</UploadZoneHint>
                        </UploadZone>
                    </>
                )}

                {inputMethod === "paste" && (
                    <>
                        <InlineInput
                            placeholder="Paste your OpenAPI / Swagger spec (JSON or YAML)..."
                            value={specContent}
                            onChange={e => { setSpecContent(e.target.value); setValidationError(null); }}
                        />
                        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
                            <InlineButton
                                variant="primary"
                                onClick={handleSubmitPaste}
                                disabled={!specContent.trim() || isProcessing}
                            >
                                {isProcessing ? "Processing..." : "Submit"}
                            </InlineButton>
                        </div>
                    </>
                )}

                {inputMethod === "url" && (
                    <InlineUrlRow>
                        <InlineUrlInput
                            type="url"
                            placeholder="https://api.example.com/openapi.json"
                            value={specUrl}
                            onChange={e => { setSpecUrl(e.target.value); setValidationError(null); }}
                        />
                        <InlineButton
                            variant="primary"
                            onClick={handleSubmitUrl}
                            disabled={!specUrl.trim() || isProcessing}
                        >
                            {isProcessing ? "Fetching..." : "Fetch"}
                        </InlineButton>
                    </InlineUrlRow>
                )}

                {validationError && <InlineErrorText>{validationError}</InlineErrorText>}

                <SkipRow>
                    {showSkipConfirm ? (
                        <>
                            <SkipWarning>{isService ? "Skip service generation?" : "Skip connector generation?"}</SkipWarning>
                            <InlineButton variant="secondary" onClick={() => setShowSkipConfirm(false)}>
                                Cancel
                            </InlineButton>
                            <InlineButton variant="danger" onClick={handleSkip}>
                                Confirm Skip
                            </InlineButton>
                        </>
                    ) : (
                        <InlineButton
                            variant="secondary"
                            onClick={() => setShowSkipConfirm(true)}
                            disabled={isProcessing}
                        >
                            Skip
                        </InlineButton>
                    )}
                </SkipRow>
            </InlineCard>
        );
    }

    if (stage === "generating") {
        return (
            <InlineCard>
                <InlineCardHeader>
                    <InlineCardIcon>
                        <span className="codicon codicon-loading codicon-modifier-spin" />
                    </InlineCardIcon>
                    <InlineCardTitle>
                        Generating {isService ? "service" : "connector"}{data.spec?.title ? ` for ${data.spec.title}` : "..."}
                    </InlineCardTitle>
                </InlineCardHeader>
            </InlineCard>
        );
    }

    if (stage === "generated") {
        return (
            <InlineCard>
                <InlineCardHeader>
                    <InlineCardIcon style={{ color: "var(--vscode-charts-green, #388a34)" }}>
                        <span className="codicon codicon-pass" />
                    </InlineCardIcon>
                    <InlineCardTitle>
                        {isService ? "Service ready" : "Connector ready"}{data.spec?.title ? `: ${data.spec.title}` : (data.serviceName ? `: ${data.serviceName}` : "")}
                    </InlineCardTitle>
                </InlineCardHeader>
                {(data.connector || data.spec) && (
                    <InlineDetailsBlock>
                        {data.connector && (
                            <>
                                <InlineDetailRow>
                                    <InlineDetailLabel>Module</InlineDetailLabel>
                                    <InlineDetailValue>{data.connector.moduleName}</InlineDetailValue>
                                </InlineDetailRow>
                                <InlineDetailRow>
                                    <InlineDetailLabel>Import</InlineDetailLabel>
                                    <InlineDetailValue>{data.connector.importStatement}</InlineDetailValue>
                                </InlineDetailRow>
                            </>
                        )}
                        {data.spec?.endpointCount !== undefined && (
                            <InlineDetailRow>
                                <InlineDetailLabel>Endpoints</InlineDetailLabel>
                                <InlineDetailValue>{data.spec.endpointCount}</InlineDetailValue>
                            </InlineDetailRow>
                        )}
                    </InlineDetailsBlock>
                )}
            </InlineCard>
        );
    }

    if (stage === "skipped") {
        return (
            <InlineCard>
                <InlineCardHeader>
                    <InlineCardIcon>
                        <span className="codicon codicon-circle-slash" />
                    </InlineCardIcon>
                    <InlineCardTitle>
                        {isService ? "Service generation skipped" : "Connector generation skipped"}{data.serviceName ? `: ${data.serviceName}` : ""}
                    </InlineCardTitle>
                </InlineCardHeader>
            </InlineCard>
        );
    }

    if (stage === "error" && data.error) {
        return (
            <InlineCard>
                <InlineCardHeader>
                    <InlineCardIcon style={{ color: "var(--vscode-errorForeground)" }}>
                        <span className="codicon codicon-warning" />
                    </InlineCardIcon>
                    <InlineCardTitle>{isService ? "Service generation failed" : "Connector generation failed"}</InlineCardTitle>
                </InlineCardHeader>
                <InlineStatusRow>{data.error.message}</InlineStatusRow>
            </InlineCard>
        );
    }

    return null;
};

export default ConnectorCard;
