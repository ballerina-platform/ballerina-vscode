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

import styled from "@emotion/styled";
import { AIMachineEventType, LoginMethod } from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";

import { AlertBox } from "../AlertBox";
import { useEffect, useState } from "react";
import { Codicon, RadioButtonGroup } from "@wso2/ui-toolkit";
import { VSCodeButton, VSCodeTextField } from "@vscode/webview-ui-toolkit/react";

const Container = styled.div`
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    padding: 10px;
    gap: 8px;
`;

// AlertBox-style container for consistency
const AlertContainer = styled.div<{ variant: "primary" | "secondary" }>`
    border-left: 0.3rem solid
        var(
            ${(props: { variant: string }) =>
                props.variant === "secondary" ? "--vscode-editorWidget-border" : "--vscode-focusBorder"}
        );
    background: var(
        ${(props: { variant: string }) =>
            props.variant === "secondary" ? "transparent" : "--vscode-inputValidation-infoBackground"}
    );
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    padding: 1rem;
    gap: 12px;
    margin-bottom: 15px;
    width: -webkit-fill-available;
`;

const Title = styled.div`
    color: var(--vscode-foreground);
    font-weight: 500;
`;

const SubTitle = styled.div`
    color: var(--vscode-descriptionForeground);
    font-size: 12px;
    font-weight: 400;
    line-height: 1.5;
`;

const InputContainer = styled.div`
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 2px 4px;
    border: 1px solid var(--vscode-editorWidget-border);
    border-radius: 4px;
    background-color: var(--vscode-editor-background);
    color: var(--vscode-editor-foreground);
    width: 100%;
    box-sizing: border-box;
    min-height: 32px;
    &:focus-within {
        border-color: var(--vscode-button-background);
    }
`;

const InputRow = styled.div`
    display: flex;
    align-items: center;
    width: 100%;
    min-height: 28px;
    gap: 8px;
`;

const StyledTextField = styled(VSCodeTextField)`
    flex: 1;
    border: none;
    background: transparent;
    height: 28px;
    min-height: 28px;
    display: flex;
    align-items: center;
    width: 100%;
    &::part(control) {
        border: none !important;
        background: transparent !important;
        padding: 0 4px;
        outline: none !important;
        box-shadow: none !important;
        height: 28px !important;
        min-height: 28px !important;
        line-height: 28px !important;
        display: flex !important;
        align-items: center !important;
        width: 100% !important;
        flex: 1 !important;
    }
    &::part(control):focus {
        outline: none !important;
        box-shadow: none !important;
        border: none !important;
    }
    &::part(root) {
        border: none !important;
        background: transparent !important;
        height: 28px !important;
        min-height: 28px !important;
        display: flex !important;
        align-items: center !important;
        width: 100% !important;
        flex: 1 !important;
    }
`;

const EyeButton = styled.button`
    width: 24px;
    height: 24px;
    background-color: transparent;
    color: var(--vscode-icon-foreground);
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background-color 0.2s;
    box-sizing: border-box;
    flex-shrink: 0;
    &:hover {
        background-color: var(--vscode-toolbar-hoverBackground);
    }
    &:active {
        background-color: var(--vscode-toolbar-activeBackground);
    }
`;

const ButtonContainer = styled.div`
    display: flex;
    gap: 8px;
    align-self: flex-start;
`;

const ErrorMessage = styled.div`
    display: flex;
    align-items: flex-start;
    gap: 8px;
    color: var(--vscode-errorForeground);
    font-size: 12px;
    font-weight: 400;
    line-height: 1.5;
    width: 100%;
`;

const AuthModeToggle = styled.div`
    display: flex;
    gap: 0;
    border: 1px solid var(--vscode-editorWidget-border);
    border-radius: 4px;
    overflow: hidden;
    width: 100%;
`;

const AuthModeButton = styled.button<{ active: boolean }>`
    flex: 1;
    padding: 5px 8px;
    font-size: 12px;
    cursor: pointer;
    border: none;
    background: ${(props: { active: boolean }) => props.active ? 'var(--vscode-button-background)' : 'transparent'};
    color: ${(props: { active: boolean }) => props.active ? 'var(--vscode-button-foreground)' : 'var(--vscode-foreground)'};
    &:hover {
        background: ${(props: { active: boolean }) => props.active ? 'var(--vscode-button-hoverBackground)' : 'var(--vscode-toolbar-hoverBackground)'};
    }
    &:disabled {
        opacity: 0.5;
        cursor: default;
    }
`;

interface WaitingForLoginProps {
    loginMethod?: LoginMethod;
    isValidating?: boolean;
    errorMessage?: string;
}

const WaitingForLogin = ({ loginMethod, isValidating = false, errorMessage }: WaitingForLoginProps) => {
    const { rpcClient } = useRpcContext();
    const [apiKey, setApiKey] = useState("");
    const [showApiKey, setShowApiKey] = useState(false);
    const [awsCredentials, setAwsCredentials] = useState({
        accessKeyId: "",
        secretAccessKey: "",
        region: "",
        sessionToken: ""
    });
    const [showAccessKey, setShowAccessKey] = useState(false);
    const [showSecretKey, setShowSecretKey] = useState(false);
    const [showSessionToken, setShowSessionToken] = useState(false);
    const [awsServiceMode, setAwsServiceMode] = useState<'bedrock' | 'anthropic_aws'>('bedrock');
    const [anthropicAwsAuthMode, setAnthropicAwsAuthMode] = useState<'sigv4' | 'apikey'>('sigv4');
    const [anthropicAwsCredentials, setAnthropicAwsCredentials] = useState({
        region: "",
        workspaceId: "",
        accessKeyId: "",
        secretAccessKey: "",
        sessionToken: "",
        apiKey: ""
    });
    const [showAnthropicAwsSecretKey, setShowAnthropicAwsSecretKey] = useState(false);
    const [showAnthropicAwsAccessKey, setShowAnthropicAwsAccessKey] = useState(false);
    const [showAnthropicAwsSessionToken, setShowAnthropicAwsSessionToken] = useState(false);
    const [showAnthropicAwsApiKey, setShowAnthropicAwsApiKey] = useState(false);
    const [vertexAiCredentials, setVertexAiCredentials] = useState({
        projectId: "",
        location: "global",
        keyFile: ""
    });

    useEffect(() => {
        if (loginMethod !== LoginMethod.VERTEX_AI) {
            return;
        }
        let cancelled = false;
        rpcClient.getAiPanelRpcClient().getDefaultVertexCredsPath().then((keyFile) => {
            if (cancelled || !keyFile) {
                return;
            }
            setVertexAiCredentials((prev) => prev.keyFile ? prev : { ...prev, keyFile });
        }).catch(() => { /* ignore */ });
        return () => { cancelled = true; };
    }, [loginMethod, rpcClient]);

    const cancelLogin = () => {
        rpcClient.sendAIStateEvent(AIMachineEventType.CANCEL_LOGIN);
    };

    const connectWithKey = () => {
        if (apiKey.trim()) {
            // Send the API key to the state machine for validation
            rpcClient.sendAIStateEvent({
                type: AIMachineEventType.SUBMIT_API_KEY,
                payload: { apiKey: apiKey.trim() },
            });
        }
    };

    const connectWithAwsCredentials = () => {
        if (awsCredentials.accessKeyId.trim() && awsCredentials.secretAccessKey.trim() && awsCredentials.region.trim()) {
            rpcClient.sendAIStateEvent({
                type: AIMachineEventType.SUBMIT_AWS_CREDENTIALS,
                payload: {
                    accessKeyId: awsCredentials.accessKeyId.trim(),
                    secretAccessKey: awsCredentials.secretAccessKey.trim(),
                    region: awsCredentials.region.trim(),
                    sessionToken: awsCredentials.sessionToken.trim() || undefined
                },
            });
        }
    };

    const handleApiKeyChange = (e: any) => {
        setApiKey(e.target.value);
    };

    const handleAwsCredentialChange = (field: keyof typeof awsCredentials) => (e: any) => {
        setAwsCredentials(prev => ({
            ...prev,
            [field]: e.target.value
        }));
    };

    const toggleApiKeyVisibility = () => {
        setShowApiKey(!showApiKey);
    };

    const toggleAccessKeyVisibility = () => {
        setShowAccessKey(!showAccessKey);
    };

    const toggleSecretKeyVisibility = () => {
        setShowSecretKey(!showSecretKey);
    };

    const toggleSessionTokenVisibility = () => {
        setShowSessionToken(!showSessionToken);
    };

    const connectWithVertexAi = () => {
        if (vertexAiCredentials.projectId.trim() && vertexAiCredentials.location.trim() &&
            vertexAiCredentials.keyFile.trim()) {
            rpcClient.sendAIStateEvent({
                type: AIMachineEventType.SUBMIT_VERTEX_AI_CREDENTIALS,
                payload: {
                    projectId: vertexAiCredentials.projectId.trim(),
                    location: vertexAiCredentials.location.trim(),
                    keyFile: vertexAiCredentials.keyFile.trim()
                },
            });
        }
    };

    const handleVertexAiCredentialChange = (field: keyof typeof vertexAiCredentials) => (e: any) => {
        setVertexAiCredentials(prev => ({
            ...prev,
            [field]: e.target.value
        }));
    };

    const connectWithAnthropicAwsCredentials = () => {
        const { region, workspaceId, accessKeyId, secretAccessKey, sessionToken, apiKey } = anthropicAwsCredentials;
        const commonValid = region.trim() && workspaceId.trim();
        const modeValid = anthropicAwsAuthMode === 'apikey'
            ? apiKey.trim()
            : (accessKeyId.trim() && secretAccessKey.trim());
        if (commonValid && modeValid) {
            rpcClient.sendAIStateEvent({
                type: AIMachineEventType.SUBMIT_ANTHROPIC_AWS_CREDENTIALS,
                payload: {
                    region: region.trim(),
                    workspaceId: workspaceId.trim(),
                    authMode: anthropicAwsAuthMode,
                    ...(anthropicAwsAuthMode === 'apikey'
                        ? { apiKey: apiKey.trim() }
                        : {
                            accessKeyId: accessKeyId.trim(),
                            secretAccessKey: secretAccessKey.trim(),
                            sessionToken: sessionToken.trim() || undefined
                        })
                },
            });
        }
    };

    const handleAnthropicAwsCredentialChange = (field: keyof typeof anthropicAwsCredentials) => (e: any) => {
        setAnthropicAwsCredentials(prev => ({
            ...prev,
            [field]: e.target.value
        }));
    };

    if (loginMethod === LoginMethod.ANTHROPIC_KEY) {
        return (
            <Container>
                <AlertContainer variant="primary">
                    <Title>Connect with Anthropic API Key</Title>
                    <SubTitle>
                        Enter your Anthropic API key to connect to WSO2 Integrator Copilot. Your API key will be securely stored
                        and used for authentication.
                    </SubTitle>

                    <InputContainer>
                        <InputRow>
                            <StyledTextField
                                type={showApiKey ? "text" : "password"}
                                placeholder="Enter your Anthropic API key"
                                value={apiKey}
                                onInput={handleApiKeyChange}
                                disabled={isValidating}
                            />
                            <EyeButton
                                type="button"
                                onClick={toggleApiKeyVisibility}
                                title={showApiKey ? "Hide API key" : "Show API key"}
                                disabled={isValidating}
                            >
                                <Codicon name={showApiKey ? "eye-closed" : "eye"} />
                            </EyeButton>
                        </InputRow>
                    </InputContainer>

                    {errorMessage && (
                        <ErrorMessage>
                            <Codicon name="error" />
                            <span>{errorMessage}</span>
                        </ErrorMessage>
                    )}

                    <ButtonContainer>
                        <VSCodeButton
                            appearance="primary"
                            onClick={connectWithKey}
                            disabled={isValidating || !apiKey || apiKey.trim().length === 0}
                        >
                            {isValidating ? "Validating..." : "Connect with Key"}
                        </VSCodeButton>
                        <VSCodeButton
                            appearance="secondary"
                            onClick={cancelLogin}
                            disabled={isValidating}
                        >
                            Cancel
                        </VSCodeButton>
                    </ButtonContainer>
                </AlertContainer>
            </Container>
        );
    }

    if (loginMethod === LoginMethod.AWS_UNIFIED) {
        const isBedrockFormValid = !!(
            awsCredentials.accessKeyId.trim() &&
            awsCredentials.secretAccessKey.trim() &&
            awsCredentials.region.trim()
        );
        const isAnthropicAwsFormValid = !!(
            anthropicAwsCredentials.region.trim() &&
            anthropicAwsCredentials.workspaceId.trim() &&
            (anthropicAwsAuthMode === 'apikey'
                ? anthropicAwsCredentials.apiKey.trim()
                : (anthropicAwsCredentials.accessKeyId.trim() && anthropicAwsCredentials.secretAccessKey.trim()))
        );
        const isFormValid = awsServiceMode === 'bedrock' ? isBedrockFormValid : isAnthropicAwsFormValid;

        return (
            <Container>
                <AlertContainer variant="primary">
                    <Title>Connect with AWS</Title>
                    <SubTitle>
                        Choose your AWS-based AI provider. Use AWS Bedrock to access Claude via Amazon's inference service,
                        or Claude Platform on AWS for Anthropic's native API with same-day feature parity.
                    </SubTitle>

                    <AuthModeToggle>
                        <AuthModeButton
                            active={awsServiceMode === 'bedrock'}
                            onClick={() => setAwsServiceMode('bedrock')}
                            disabled={isValidating}
                        >
                            AWS Bedrock
                        </AuthModeButton>
                        <AuthModeButton
                            active={awsServiceMode === 'anthropic_aws'}
                            onClick={() => setAwsServiceMode('anthropic_aws')}
                            disabled={isValidating}
                        >
                            Claude Platform on AWS
                        </AuthModeButton>
                    </AuthModeToggle>

                    {awsServiceMode === 'bedrock' && (
                        <>
                            <InputContainer>
                                <InputRow>
                                    <StyledTextField
                                        type={showAccessKey ? "text" : "password"}
                                        placeholder="AWS Access Key ID (AKIA...)"
                                        value={awsCredentials.accessKeyId}
                                        onInput={handleAwsCredentialChange('accessKeyId')}
                                        disabled={isValidating}
                                    />
                                    <EyeButton
                                        type="button"
                                        onClick={toggleAccessKeyVisibility}
                                        title={showAccessKey ? "Hide access key" : "Show access key"}
                                        disabled={isValidating}
                                    >
                                        <Codicon name={showAccessKey ? "eye-closed" : "eye"} />
                                    </EyeButton>
                                </InputRow>
                            </InputContainer>

                            <InputContainer>
                                <InputRow>
                                    <StyledTextField
                                        type={showSecretKey ? "text" : "password"}
                                        placeholder="AWS Secret Access Key"
                                        value={awsCredentials.secretAccessKey}
                                        onInput={handleAwsCredentialChange('secretAccessKey')}
                                        disabled={isValidating}
                                    />
                                    <EyeButton
                                        type="button"
                                        onClick={toggleSecretKeyVisibility}
                                        title={showSecretKey ? "Hide secret key" : "Show secret key"}
                                        disabled={isValidating}
                                    >
                                        <Codicon name={showSecretKey ? "eye-closed" : "eye"} />
                                    </EyeButton>
                                </InputRow>
                            </InputContainer>

                            <InputContainer>
                                <InputRow>
                                    <StyledTextField
                                        type="text"
                                        placeholder="AWS Region (e.g., us-east-1)"
                                        value={awsCredentials.region}
                                        onInput={handleAwsCredentialChange('region')}
                                        disabled={isValidating}
                                    />
                                </InputRow>
                            </InputContainer>

                            <InputContainer>
                                <InputRow>
                                    <StyledTextField
                                        type={showSessionToken ? "text" : "password"}
                                        placeholder="Session Token (optional)"
                                        value={awsCredentials.sessionToken}
                                        onInput={handleAwsCredentialChange('sessionToken')}
                                        disabled={isValidating}
                                    />
                                    <EyeButton
                                        type="button"
                                        onClick={toggleSessionTokenVisibility}
                                        title={showSessionToken ? "Hide session token" : "Show session token"}
                                        disabled={isValidating}
                                    >
                                        <Codicon name={showSessionToken ? "eye-closed" : "eye"} />
                                    </EyeButton>
                                </InputRow>
                            </InputContainer>
                        </>
                    )}

                    {awsServiceMode === 'anthropic_aws' && (
                        <>
                            <InputContainer>
                                <InputRow>
                                    <StyledTextField
                                        type="text"
                                        placeholder="AWS Region (e.g., us-west-2)"
                                        value={anthropicAwsCredentials.region}
                                        onInput={handleAnthropicAwsCredentialChange('region')}
                                        disabled={isValidating}
                                    />
                                </InputRow>
                            </InputContainer>

                            <InputContainer>
                                <InputRow>
                                    <StyledTextField
                                        type="text"
                                        placeholder="Workspace ID (e.g., wrkspc_...)"
                                        value={anthropicAwsCredentials.workspaceId}
                                        onInput={handleAnthropicAwsCredentialChange('workspaceId')}
                                        disabled={isValidating}
                                    />
                                </InputRow>
                            </InputContainer>

                            <RadioButtonGroup
                                orientation="horizontal"
                                value={anthropicAwsAuthMode}
                                onChange={(e: any) => setAnthropicAwsAuthMode((e.target as HTMLInputElement).value as 'sigv4' | 'apikey')}
                                options={[
                                    { value: 'sigv4', content: 'IAM Credentials', disabled: isValidating },
                                    { value: 'apikey', content: 'API Key', disabled: isValidating },
                                ]}
                            />

                            {anthropicAwsAuthMode === 'sigv4' && (
                                <>
                                    <InputContainer>
                                        <InputRow>
                                            <StyledTextField
                                                type={showAnthropicAwsAccessKey ? "text" : "password"}
                                                placeholder="AWS Access Key ID (AKIA...)"
                                                value={anthropicAwsCredentials.accessKeyId}
                                                onInput={handleAnthropicAwsCredentialChange('accessKeyId')}
                                                disabled={isValidating}
                                            />
                                            <EyeButton
                                                type="button"
                                                onClick={() => setShowAnthropicAwsAccessKey(v => !v)}
                                                title={showAnthropicAwsAccessKey ? "Hide access key" : "Show access key"}
                                                disabled={isValidating}
                                            >
                                                <Codicon name={showAnthropicAwsAccessKey ? "eye-closed" : "eye"} />
                                            </EyeButton>
                                        </InputRow>
                                    </InputContainer>

                                    <InputContainer>
                                        <InputRow>
                                            <StyledTextField
                                                type={showAnthropicAwsSecretKey ? "text" : "password"}
                                                placeholder="AWS Secret Access Key"
                                                value={anthropicAwsCredentials.secretAccessKey}
                                                onInput={handleAnthropicAwsCredentialChange('secretAccessKey')}
                                                disabled={isValidating}
                                            />
                                            <EyeButton
                                                type="button"
                                                onClick={() => setShowAnthropicAwsSecretKey(v => !v)}
                                                title={showAnthropicAwsSecretKey ? "Hide secret key" : "Show secret key"}
                                                disabled={isValidating}
                                            >
                                                <Codicon name={showAnthropicAwsSecretKey ? "eye-closed" : "eye"} />
                                            </EyeButton>
                                        </InputRow>
                                    </InputContainer>

                                    <InputContainer>
                                        <InputRow>
                                            <StyledTextField
                                                type={showAnthropicAwsSessionToken ? "text" : "password"}
                                                placeholder="Session Token (optional)"
                                                value={anthropicAwsCredentials.sessionToken}
                                                onInput={handleAnthropicAwsCredentialChange('sessionToken')}
                                                disabled={isValidating}
                                            />
                                            <EyeButton
                                                type="button"
                                                onClick={() => setShowAnthropicAwsSessionToken(v => !v)}
                                                title={showAnthropicAwsSessionToken ? "Hide session token" : "Show session token"}
                                                disabled={isValidating}
                                            >
                                                <Codicon name={showAnthropicAwsSessionToken ? "eye-closed" : "eye"} />
                                            </EyeButton>
                                        </InputRow>
                                    </InputContainer>
                                </>
                            )}

                            {anthropicAwsAuthMode === 'apikey' && (
                                <InputContainer>
                                    <InputRow>
                                        <StyledTextField
                                            type={showAnthropicAwsApiKey ? "text" : "password"}
                                            placeholder="API Key (aws-external-anthropic-api-key-...)"
                                            value={anthropicAwsCredentials.apiKey}
                                            onInput={handleAnthropicAwsCredentialChange('apiKey')}
                                            disabled={isValidating}
                                        />
                                        <EyeButton
                                            type="button"
                                            onClick={() => setShowAnthropicAwsApiKey(v => !v)}
                                            title={showAnthropicAwsApiKey ? "Hide API key" : "Show API key"}
                                            disabled={isValidating}
                                        >
                                            <Codicon name={showAnthropicAwsApiKey ? "eye-closed" : "eye"} />
                                        </EyeButton>
                                    </InputRow>
                                </InputContainer>
                            )}
                        </>
                    )}

                    {errorMessage && (
                        <ErrorMessage>
                            <Codicon name="error" />
                            <span>{errorMessage}</span>
                        </ErrorMessage>
                    )}

                    <ButtonContainer>
                        <VSCodeButton
                            appearance="primary"
                            onClick={awsServiceMode === 'bedrock' ? connectWithAwsCredentials : connectWithAnthropicAwsCredentials}
                            disabled={isValidating || !isFormValid}
                        >
                            {isValidating
                                ? "Validating..."
                                : awsServiceMode === 'bedrock'
                                    ? "Connect with AWS Bedrock"
                                    : "Connect with Claude Platform on AWS"}
                        </VSCodeButton>
                        <VSCodeButton
                            appearance="secondary"
                            onClick={cancelLogin}
                            disabled={isValidating}
                        >
                            Cancel
                        </VSCodeButton>
                    </ButtonContainer>
                </AlertContainer>
            </Container>
        );
    }

    if (loginMethod === LoginMethod.AWS_BEDROCK) {
        const isFormValid = awsCredentials.accessKeyId.trim() &&
                           awsCredentials.secretAccessKey.trim() &&
                           awsCredentials.region.trim();

        return (
            <Container>
                <AlertContainer variant="primary">
                    <Title>Connect with AWS Bedrock</Title>
                    <SubTitle>
                        Enter your AWS credentials to connect to WSO2 Integrator Copilot via AWS Bedrock. Your credentials will be securely stored
                        and used for authentication.
                    </SubTitle>

                    <InputContainer>
                        <InputRow>
                            <StyledTextField
                                type={showAccessKey ? "text" : "password"}
                                placeholder="AWS Access Key ID (AKIA...)"
                                value={awsCredentials.accessKeyId}
                                onInput={handleAwsCredentialChange('accessKeyId')}
                                disabled={isValidating}
                            />
                            <EyeButton
                                type="button"
                                onClick={toggleAccessKeyVisibility}
                                title={showAccessKey ? "Hide access key" : "Show access key"}
                                disabled={isValidating}
                            >
                                <Codicon name={showAccessKey ? "eye-closed" : "eye"} />
                            </EyeButton>
                        </InputRow>
                    </InputContainer>

                    <InputContainer>
                        <InputRow>
                            <StyledTextField
                                type={showSecretKey ? "text" : "password"}
                                placeholder="AWS Secret Access Key"
                                value={awsCredentials.secretAccessKey}
                                onInput={handleAwsCredentialChange('secretAccessKey')}
                                disabled={isValidating}
                            />
                            <EyeButton
                                type="button"
                                onClick={toggleSecretKeyVisibility}
                                title={showSecretKey ? "Hide secret key" : "Show secret key"}
                                disabled={isValidating}
                            >
                                <Codicon name={showSecretKey ? "eye-closed" : "eye"} />
                            </EyeButton>
                        </InputRow>
                    </InputContainer>

                    <InputContainer>
                        <InputRow>
                            <StyledTextField
                                type="text"
                                placeholder="AWS Region (e.g., us-east-1)"
                                value={awsCredentials.region}
                                onInput={handleAwsCredentialChange('region')}
                                disabled={isValidating}
                            />
                        </InputRow>
                    </InputContainer>

                    <InputContainer>
                        <InputRow>
                            <StyledTextField
                                type={showSessionToken ? "text" : "password"}
                                placeholder="Session Token (optional)"
                                value={awsCredentials.sessionToken}
                                onInput={handleAwsCredentialChange('sessionToken')}
                                disabled={isValidating}
                            />
                            <EyeButton
                                type="button"
                                onClick={toggleSessionTokenVisibility}
                                title={showSessionToken ? "Hide session token" : "Show session token"}
                                disabled={isValidating}
                            >
                                <Codicon name={showSessionToken ? "eye-closed" : "eye"} />
                            </EyeButton>
                        </InputRow>
                    </InputContainer>

                    {errorMessage && (
                        <ErrorMessage>
                            <Codicon name="error" />
                            <span>{errorMessage}</span>
                        </ErrorMessage>
                    )}

                    <ButtonContainer>
                        <VSCodeButton
                            appearance="primary"
                            onClick={connectWithAwsCredentials}
                            disabled={isValidating || !isFormValid}
                        >
                            {isValidating ? "Validating..." : "Connect with AWS Bedrock"}
                        </VSCodeButton>
                        <VSCodeButton
                            appearance="secondary"
                            onClick={cancelLogin}
                            disabled={isValidating}
                        >
                            Cancel
                        </VSCodeButton>
                    </ButtonContainer>
                </AlertContainer>
            </Container>
        );
    }

    if (loginMethod === LoginMethod.VERTEX_AI) {
        const isFormValid = !!(vertexAiCredentials.projectId.trim() &&
                           vertexAiCredentials.location.trim() &&
                           vertexAiCredentials.keyFile.trim());
        const submitDisabled = isValidating || !isFormValid;

        return (
            <Container>
                <AlertContainer variant="primary">
                    <Title>Connect with Google Vertex AI</Title>
                    <SubTitle>
                        Select the GCP service account JSON key file to authenticate WSO2 Integrator Copilot with Google Vertex AI.
                        The path is stored locally and read on each request, so the file must remain accessible at this location.
                    </SubTitle>

                    <InputContainer>
                        <InputRow>
                            <StyledTextField
                                type="text"
                                placeholder="GCP Project ID"
                                value={vertexAiCredentials.projectId}
                                onInput={handleVertexAiCredentialChange('projectId')}
                                disabled={isValidating}
                            />
                        </InputRow>
                    </InputContainer>

                    <InputContainer>
                        <InputRow>
                            <StyledTextField
                                type="text"
                                placeholder="Location (e.g., global)"
                                value={vertexAiCredentials.location}
                                onInput={handleVertexAiCredentialChange('location')}
                                disabled={isValidating}
                            />
                        </InputRow>
                    </InputContainer>

                    <InputContainer>
                        <InputRow>
                            <StyledTextField
                                type="text"
                                placeholder="Path to service account JSON"
                                value={vertexAiCredentials.keyFile}
                                onInput={handleVertexAiCredentialChange('keyFile')}
                                disabled={isValidating}
                            />
                        </InputRow>
                    </InputContainer>

                    {errorMessage && (
                        <ErrorMessage>
                            <Codicon name="error" />
                            <span>{errorMessage}</span>
                        </ErrorMessage>
                    )}

                    <ButtonContainer>
                        <VSCodeButton
                            appearance="primary"
                            onClick={connectWithVertexAi}
                            disabled={submitDisabled}
                        >
                            {isValidating ? "Validating..." : "Validate & Connect"}
                        </VSCodeButton>
                        <VSCodeButton
                            appearance="secondary"
                            onClick={cancelLogin}
                            disabled={isValidating}
                        >
                            Cancel
                        </VSCodeButton>
                    </ButtonContainer>
                </AlertContainer>
            </Container>
        );
    }

    if (loginMethod === LoginMethod.ANTHROPIC_AWS) {
        const isFormValid = !!(
            anthropicAwsCredentials.region.trim() &&
            anthropicAwsCredentials.workspaceId.trim() &&
            (anthropicAwsAuthMode === 'apikey'
                ? anthropicAwsCredentials.apiKey.trim()
                : (anthropicAwsCredentials.accessKeyId.trim() && anthropicAwsCredentials.secretAccessKey.trim()))
        );

        return (
            <Container>
                <AlertContainer variant="primary">
                    <Title>Connect with Claude Platform on AWS</Title>
                    <SubTitle>
                        Anthropic's native API through AWS with same-day feature parity and AWS Marketplace billing.
                        Use IAM credentials or an API key provisioned by your Anthropic account representative.
                    </SubTitle>

                    <InputContainer>
                        <InputRow>
                            <StyledTextField
                                type="text"
                                placeholder="AWS Region (e.g., us-west-2)"
                                value={anthropicAwsCredentials.region}
                                onInput={handleAnthropicAwsCredentialChange('region')}
                                disabled={isValidating}
                            />
                        </InputRow>
                    </InputContainer>

                    <InputContainer>
                        <InputRow>
                            <StyledTextField
                                type="text"
                                placeholder="Workspace ID (e.g., wrkspc_...)"
                                value={anthropicAwsCredentials.workspaceId}
                                onInput={handleAnthropicAwsCredentialChange('workspaceId')}
                                disabled={isValidating}
                            />
                        </InputRow>
                    </InputContainer>

                    <AuthModeToggle>
                        <AuthModeButton
                            active={anthropicAwsAuthMode === 'sigv4'}
                            onClick={() => setAnthropicAwsAuthMode('sigv4')}
                            disabled={isValidating}
                        >
                            IAM Credentials
                        </AuthModeButton>
                        <AuthModeButton
                            active={anthropicAwsAuthMode === 'apikey'}
                            onClick={() => setAnthropicAwsAuthMode('apikey')}
                            disabled={isValidating}
                        >
                            API Key
                        </AuthModeButton>
                    </AuthModeToggle>

                    {anthropicAwsAuthMode === 'sigv4' && (
                        <>
                            <InputContainer>
                                <InputRow>
                                    <StyledTextField
                                        type={showAnthropicAwsAccessKey ? "text" : "password"}
                                        placeholder="AWS Access Key ID (AKIA...)"
                                        value={anthropicAwsCredentials.accessKeyId}
                                        onInput={handleAnthropicAwsCredentialChange('accessKeyId')}
                                        disabled={isValidating}
                                    />
                                    <EyeButton
                                        type="button"
                                        onClick={() => setShowAnthropicAwsAccessKey(v => !v)}
                                        title={showAnthropicAwsAccessKey ? "Hide access key" : "Show access key"}
                                        disabled={isValidating}
                                    >
                                        <Codicon name={showAnthropicAwsAccessKey ? "eye-closed" : "eye"} />
                                    </EyeButton>
                                </InputRow>
                            </InputContainer>

                            <InputContainer>
                                <InputRow>
                                    <StyledTextField
                                        type={showAnthropicAwsSecretKey ? "text" : "password"}
                                        placeholder="AWS Secret Access Key"
                                        value={anthropicAwsCredentials.secretAccessKey}
                                        onInput={handleAnthropicAwsCredentialChange('secretAccessKey')}
                                        disabled={isValidating}
                                    />
                                    <EyeButton
                                        type="button"
                                        onClick={() => setShowAnthropicAwsSecretKey(v => !v)}
                                        title={showAnthropicAwsSecretKey ? "Hide secret key" : "Show secret key"}
                                        disabled={isValidating}
                                    >
                                        <Codicon name={showAnthropicAwsSecretKey ? "eye-closed" : "eye"} />
                                    </EyeButton>
                                </InputRow>
                            </InputContainer>

                            <InputContainer>
                                <InputRow>
                                    <StyledTextField
                                        type={showAnthropicAwsSessionToken ? "text" : "password"}
                                        placeholder="Session Token (optional)"
                                        value={anthropicAwsCredentials.sessionToken}
                                        onInput={handleAnthropicAwsCredentialChange('sessionToken')}
                                        disabled={isValidating}
                                    />
                                    <EyeButton
                                        type="button"
                                        onClick={() => setShowAnthropicAwsSessionToken(v => !v)}
                                        title={showAnthropicAwsSessionToken ? "Hide session token" : "Show session token"}
                                        disabled={isValidating}
                                    >
                                        <Codicon name={showAnthropicAwsSessionToken ? "eye-closed" : "eye"} />
                                    </EyeButton>
                                </InputRow>
                            </InputContainer>
                        </>
                    )}

                    {anthropicAwsAuthMode === 'apikey' && (
                        <InputContainer>
                            <InputRow>
                                <StyledTextField
                                    type={showAnthropicAwsApiKey ? "text" : "password"}
                                    placeholder="API Key (aws-external-anthropic-api-key-...)"
                                    value={anthropicAwsCredentials.apiKey}
                                    onInput={handleAnthropicAwsCredentialChange('apiKey')}
                                    disabled={isValidating}
                                />
                                <EyeButton
                                    type="button"
                                    onClick={() => setShowAnthropicAwsApiKey(v => !v)}
                                    title={showAnthropicAwsApiKey ? "Hide API key" : "Show API key"}
                                    disabled={isValidating}
                                >
                                    <Codicon name={showAnthropicAwsApiKey ? "eye-closed" : "eye"} />
                                </EyeButton>
                            </InputRow>
                        </InputContainer>
                    )}

                    {errorMessage && (
                        <ErrorMessage>
                            <Codicon name="error" />
                            <span>{errorMessage}</span>
                        </ErrorMessage>
                    )}

                    <ButtonContainer>
                        <VSCodeButton
                            appearance="primary"
                            onClick={connectWithAnthropicAwsCredentials}
                            disabled={isValidating || !isFormValid}
                        >
                            {isValidating ? "Validating..." : "Connect with Claude Platform on AWS"}
                        </VSCodeButton>
                        <VSCodeButton
                            appearance="secondary"
                            onClick={cancelLogin}
                            disabled={isValidating}
                        >
                            Cancel
                        </VSCodeButton>
                    </ButtonContainer>
                </AlertContainer>
            </Container>
        );
    }

    // Default: BI_INTEL login method

    return (
        <Container>
            <AlertBox
                buttonTitle="Cancel"
                onClick={cancelLogin}
                subTitle={
                    "Waiting for the login credentials. Please sign in to your WSO2 Integrator Copilot account in the browser window to continue."
                }
                title={"Waiting for Login"}
            />
        </Container>
    );
};

export default WaitingForLogin;
