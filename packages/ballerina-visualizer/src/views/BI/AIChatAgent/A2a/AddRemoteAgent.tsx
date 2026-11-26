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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { A2aAgentCardInfo, FlowNode, LineRange, NodePosition, ToolData } from "@wso2/ballerina-core";
import { FormLoadingState } from "@wso2/ballerina-side-panel";
import type { FormHandle } from "@wso2/ballerina-side-panel";
import FlowNodeForm from "../../Forms/FlowNodeForm";
import { Container, LoadError } from "../styles";
import {
    getEndOfFileLineRange, refreshAgentNodeLineRange, removeQuotes, resolveAgentNodePosition, resolveVariableValue,
    withCurrentAgentTools,
} from "../utils";
import { AgentCardView } from "./AgentCardView";
import { credentialHint, isEmptyRecord, needsSecret, quoteBareUrl, secretProblem } from "./remoteAgentConnection";

/**
 * "Use Remote Agent (A2A)": the `ai:A2aToolKit` form the language server describes (`A2A_TOOL_KIT`), shown with
 * FlowNodeForm like the MCP server form. The remote agent's Agent Card is read from the Agent Card field when Fetch Card is clicked and
 * shown under it, and it decides whether the toolkit's secret is required.
 */

const A2A_TOOL_KIT = "A2A_TOOL_KIT";
export const A2A_AGENT_TOOL_TYPE = "A2A Agent";

// Properties of the A2A_TOOL_KIT node: the parameters of ai:A2aToolKit's init, and the variable it is assigned to
const VARIABLE_FIELD_KEY = "variable";
const AGENT_FIELD_KEY = "agent";
const SECRET_FIELD_KEY = "secret";
const NAME_FIELD_KEY = "$name";
const CLIENT_CONFIG_FIELD_KEY = "clientConfig";
const HEADERS_FIELD_KEY = "headers";
// Shown above the form in place of ai:A2aToolKit's init documentation, which is written for code
const FORM_DESCRIPTION = "Call an agent that runs anywhere, over the A2A protocol. Its Agent Card is read from the "
    + "Agent Card field and shown below it.";
// Shown when the agent asks for credentials to serve its card
const PROTECTED_CARD_NOTICE = "The agent asks for credentials to show its Agent Card, so it can't be shown here. "
    + "Set them in Headers or Client Config under Advanced Configurations: the toolkit sends them when it reads the card.";
// A new toolkit's variable until the card names it
const DEFAULT_VARIABLE_NAME = "remoteAgent";

interface AddRemoteAgentProps {
    agentNode: FlowNode;
    /** Set to view and edit an A2A tool that is already on the agent, instead of adding one. */
    editToolName?: string;
    onAddTool?: (tool: ToolData, save: () => Promise<NodePosition | undefined>) => void;
    onSave?: () => void;
}

const stringOf = (value: unknown): string => (typeof value === "string" ? value : "");

/** Names already declared at module level, which the toolkit's variable must not reuse. */
function moduleNames(moduleNodes: { flowModel?: { connections?: FlowNode[]; variables?: FlowNode[] } } | undefined): Set<string> {
    const names = new Set<string>();
    for (const node of [...(moduleNodes?.flowModel?.connections ?? []), ...(moduleNodes?.flowModel?.variables ?? [])]) {
        const value = (node.properties as any)?.[VARIABLE_FIELD_KEY]?.value;
        if (typeof value === "string" && value) {
            names.add(value);
        }
    }
    return names;
}

function uniqueName(base: string, reserved: Set<string>): string {
    let name = base;
    for (let i = 1; reserved.has(name); i++) {
        name = `${base}${i}`;
    }
    return name;
}

type TypedProperty = { value?: unknown; types?: { fieldType?: string; selected?: boolean }[] };

const AGENT_URL_PLACEHOLDER = "\"https://agent.example.com\"";
// The agent field takes the card's address or the card itself, so it is named after the card
const AGENT_FIELD_LABEL = "Agent Card";
const AGENT_FIELD_DESCRIPTION = "Where the agent serves its Agent Card, such as \"https://agent.example.com\", or the "
    + "card itself as an a2a:AgentCard value.";

/** Selects a field's expression input, if it has one. */
function selectExpressionInput(property: TypedProperty | undefined) {
    const wanted = property?.types?.find((t) => t.fieldType === "EXPRESSION");
    if (wanted) {
        for (const type of property.types) {
            type.selected = type === wanted;
        }
    }
}

/**
 * Opens the URL and the secret in their expression inputs. `agent` takes an `a2a:AgentCard` or a URL, so the form
 * would open it in the record editor, but the URL is what the form is for; a card record that is already saved keeps
 * the record editor. The secret's text input would write the credential into the code, while an expression can name
 * a configurable that Config.toml fills.
 */
function selectInputs(node: FlowNode) {
    const properties = node.properties as Record<string, TypedProperty> | undefined;
    const agent = properties?.[AGENT_FIELD_KEY];
    if (agent && !stringOf(agent.value).trim().startsWith("{")) {
        selectExpressionInput(agent);
        // The parameter's placeholder is an empty AgentCard record; the expression input takes a URL
        (agent as { placeholder?: string }).placeholder = AGENT_URL_PLACEHOLDER;
    }
    const metadata = (agent as { metadata?: { label?: string; description?: string } } | undefined)?.metadata;
    if (metadata) {
        metadata.label = AGENT_FIELD_LABEL;
        metadata.description = AGENT_FIELD_DESCRIPTION;
    }
    selectExpressionInput(properties?.[SECRET_FIELD_KEY]);
}

export function AddRemoteAgent({ agentNode, editToolName, onAddTool, onSave }: AddRemoteAgentProps) {
    const { rpcClient } = useRpcContext();
    const editing = Boolean(editToolName);

    const [isLoading, setIsLoading] = useState(true);
    const [loadFailed, setLoadFailed] = useState<string>();
    const [isSaving, setIsSaving] = useState(false);

    const [card, setCard] = useState<A2aAgentCardInfo>();
    const [cardLoading, setCardLoading] = useState(false);
    const [cardError, setCardError] = useState<string>();
    const [unsupported, setUnsupported] = useState<string>();
    // The agent asks for credentials to serve its card, so it can't be shown; the toolkit can still read it
    const [cardProtected, setCardProtected] = useState(false);
    const [agentValue, setAgentValue] = useState("");
    const [secretValue, setSecretValue] = useState("");

    const templateRef = useRef<FlowNode>();
    const nodeRef = useRef<FlowNode>();
    const fileNameRef = useRef<string>("");
    const targetLineRangeRef = useRef<LineRange>();
    const projectPathRef = useRef<string>("");
    const formRef = useRef<FormHandle>(null);
    const reservedNamesRef = useRef<Set<string>>(new Set());
    // A new toolkit is named after its card until the user names it
    const autoNameRef = useRef<string>();
    const nameEditedRef = useRef(false);
    const fetchSeqRef = useRef(0);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const agentFileName = agentNode?.codedata?.lineRange?.fileName;
                const [location, moduleNodes, agentFile, endLineRange] = await Promise.all([
                    rpcClient.getVisualizerLocation(),
                    rpcClient.getBIDiagramRpcClient().getModuleNodes(),
                    rpcClient.getVisualizerRpcClient().joinProjectPath({ segments: [agentFileName] }),
                    getEndOfFileLineRange(agentFileName, rpcClient),
                ]);
                projectPathRef.current = location.projectPath;
                reservedNamesRef.current = moduleNames(moduleNodes);
                const response = await rpcClient.getBIDiagramRpcClient().getNodeTemplate({
                    position: { line: endLineRange.endLine.line, offset: endLineRange.endLine.offset },
                    filePath: agentFile.filePath,
                    id: { node: A2A_TOOL_KIT },
                });
                if (!response.flowNode) {
                    throw new Error("The language server returned no A2A toolkit template.");
                }
                selectInputs(response.flowNode);
                if (response.flowNode.metadata) {
                    response.flowNode.metadata.description = FORM_DESCRIPTION;
                }
                templateRef.current = response.flowNode;

                if (editToolName) {
                    const existing = moduleNodes.flowModel?.variables?.find((variable) =>
                        variable.codedata?.node === A2A_TOOL_KIT
                        && variable.properties?.[VARIABLE_FIELD_KEY]?.value === editToolName);
                    if (!existing) {
                        throw new Error(`Couldn't find the declaration of ${editToolName} in the project.`);
                    }
                    if (existing.codedata?.lineRange?.fileName) {
                        existing.codedata.lineRange.fileName = (await rpcClient.getVisualizerRpcClient().joinProjectPath({
                            segments: [existing.codedata.lineRange.fileName],
                        })).filePath;
                    }
                    selectInputs(existing);
                    if (existing.metadata) {
                        existing.metadata.description = FORM_DESCRIPTION;
                    }
                    nodeRef.current = existing;
                    fileNameRef.current = existing.codedata.lineRange.fileName;
                    targetLineRangeRef.current = existing.codedata.lineRange;
                    const properties = existing.properties as Record<string, { value?: unknown }>;
                    setSecretValue(stringOf(properties?.[SECRET_FIELD_KEY]?.value));
                    setAgentValue(stringOf(properties?.[AGENT_FIELD_KEY]?.value));
                } else {
                    const properties = response.flowNode.properties as Record<string, { value?: unknown }>;
                    // A new toolkit starts with no secret, rather than the parameter's nil default
                    if (properties?.[SECRET_FIELD_KEY]) {
                        properties[SECRET_FIELD_KEY].value = "";
                    }
                    const variable = properties?.[VARIABLE_FIELD_KEY];
                    if (variable) {
                        variable.value = uniqueName(DEFAULT_VARIABLE_NAME, reservedNamesRef.current);
                        autoNameRef.current = String(variable.value);
                    }
                    nodeRef.current = response.flowNode;
                    fileNameRef.current = endLineRange.fileName;
                    targetLineRangeRef.current = endLineRange;
                }
            } catch (e) {
                console.error("Error loading the A2A toolkit form:", e);
                if (!cancelled) {
                    setLoadFailed((e as Error)?.message?.startsWith("Couldn't find")
                        ? (e as Error).message
                        : "The remote agent form could not be loaded. Close this panel and try again.");
                }
            }
            if (!cancelled) {
                setIsLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [editToolName]);

    /** Reads the card for the Agent Card field as it has it: a string, or a configurable or variable holding one. */
    const fetchCard = useCallback(async (expression: string) => {
        const seq = ++fetchSeqRef.current;
        const resolved = expression.trim()
            ? await resolveVariableValue(expression, rpcClient, projectPathRef.current, fileNameRef.current)
            : undefined;
        const source = removeQuotes(resolved ?? expression).trim();
        if (seq !== fetchSeqRef.current) {
            return;
        }
        setCard(undefined);
        setUnsupported(undefined);
        setCardProtected(false);
        if (!source) {
            setCardError(undefined);
            return;
        }
        setCardLoading(true);
        setCardError(undefined);
        try {
            const res = await rpcClient.getAIAgentRpcClient().fetchA2aAgentCard({ source });
            if (seq !== fetchSeqRef.current) {
                return;
            }
            if (res.credentialsRequired) {
                setCardProtected(true);
                // No card to name the toolkit after, so a name taken from another card goes back to the default
                if (!editing && !nameEditedRef.current) {
                    const name = uniqueName(DEFAULT_VARIABLE_NAME, reservedNamesRef.current);
                    autoNameRef.current = name;
                    formRef.current?.setFieldValue(VARIABLE_FIELD_KEY, name);
                }
            } else if (res.error || !res.card) {
                setCardError(res.error ?? "Couldn't read an Agent Card from that URL.");
            } else {
                setCard(res.card);
                setUnsupported(res.unsupported);
                // A new toolkit is named after the agent, as the MCP form names one after its server
                if (!editing && !nameEditedRef.current && res.toolkitName) {
                    const name = uniqueName(res.toolkitName, reservedNamesRef.current);
                    autoNameRef.current = name;
                    formRef.current?.setFieldValue(VARIABLE_FIELD_KEY, name);
                }
            }
        } catch (e) {
            console.error("Error reading the Agent Card:", e);
            if (seq === fetchSeqRef.current) {
                setCardError("Couldn't read the Agent Card.");
            }
        }
        if (seq === fetchSeqRef.current) {
            setCardLoading(false);
        }
    }, [rpcClient, editing]);

    // A changed URL drops the card read for the old one, and any read still on its way, until Fetch Card is clicked
    const clearCard = useCallback(() => {
        fetchSeqRef.current++;
        setCard(undefined);
        setUnsupported(undefined);
        setCardProtected(false);
        setCardError(undefined);
        setCardLoading(false);
    }, []);

    // An existing toolkit's card is read once the form is ready
    useEffect(() => {
        if (!isLoading && editing && agentValue) {
            fetchCard(agentValue);
        }
    }, [isLoading]);

    const secretError = card ? secretProblem(card, secretValue) : undefined;
    // The field takes an expression, so a URL without quotes is not valid code; the editor's own error is cryptic
    const unquotedUrl = quoteBareUrl(agentValue) !== agentValue;
    const urlHint = unquotedUrl
        ? `Put the URL in quotes, like ${quoteBareUrl(agentValue).trim()}: this field takes an expression.`
        : undefined;

    const write = async (node: FlowNode): Promise<NodePosition | undefined> => {
        const latest = await withCurrentAgentTools(agentNode, rpcClient);
        if (!latest.current) {
            await refreshAgentNodeLineRange(latest.node, rpcClient);
        }
        await rpcClient.getAIAgentRpcClient().updateA2aToolKit({ agentFlowNode: latest.node, updatedNode: node, configurables: [] });
        await rpcClient.getAIAgentRpcClient().fixMissingImports().catch((): undefined => undefined);
        return await resolveAgentNodePosition(latest.node, rpcClient);
    };

    const handleSave = async (node?: FlowNode) => {
        if (!node || (!card && !cardProtected) || unsupported || secretError) {
            return;
        }
        const properties = node.properties as Record<string, { value?: unknown }> | undefined;
        if (properties?.[AGENT_FIELD_KEY]) {
            properties[AGENT_FIELD_KEY].value = quoteBareUrl(stringOf(properties[AGENT_FIELD_KEY].value));
        }
        for (const key of [CLIENT_CONFIG_FIELD_KEY, HEADERS_FIELD_KEY]) {
            if (properties?.[key] && isEmptyRecord(stringOf(properties[key].value))) {
                properties[key].value = "";
            }
        }
        const name = stringOf(node.properties?.[VARIABLE_FIELD_KEY]?.value);
        if (onAddTool && !editing) {
            // A new tool is saved in the background, so the panel closes at once
            onAddTool({ name, type: A2A_AGENT_TOOL_TYPE } as ToolData, () => write(node));
            return;
        }
        setIsSaving(true);
        try {
            await write(node);
            onSave?.();
        } catch (e) {
            console.error("Error saving the remote agent:", e);
            setLoadFailed("Couldn't save the remote agent. Check the project for errors and try again.");
        }
        setIsSaving(false);
    };

    const injectedComponents = useMemo(() => [{
        component: (
            <AgentCardView
                card={card}
                loading={cardLoading}
                error={cardError}
                unsupported={unsupported}
                problem={urlHint ?? secretError}
                notice={cardProtected ? PROTECTED_CARD_NOTICE : card ? credentialHint(card) : undefined}
                canFetch={Boolean(removeQuotes(agentValue).trim())}
                // A URL typed without quotes is read as the URL, and quoted when the toolkit is saved
                onFetch={() => fetchCard(quoteBareUrl(agentValue))}
            />
        ),
        index: 1,
    }], [card, cardLoading, cardError, unsupported, secretError, urlHint, cardProtected, agentValue, fetchCard]);

    // The card decides the secret: required when it names one scheme, not offered when it names none
    const secretRequired = card ? needsSecret(card) : false;
    // The toolkit is named after the card and the tool name keeps its default, so the form asks for the agent's card,
    // a secret when the card asks for one, and (under Advanced Configurations) whether calls need approval
    const fieldOverrides = useMemo(() => ({
        [VARIABLE_FIELD_KEY]: { hidden: true },
        [NAME_FIELD_KEY]: { hidden: true },
        [SECRET_FIELD_KEY]: secretRequired
            ? { advanced: false, optional: false, hidden: false }
            // A secret left from another agent stays in view, out of Advanced, so it can be cleared
            : card ? { hidden: !secretProblem(card, secretValue), advanced: false } : {},
    }), [editing, secretRequired, card, secretValue]);

    const customValidator = useCallback((fieldKey: string, value: unknown) =>
        fieldKey === SECRET_FIELD_KEY && card ? secretProblem(card, stringOf(value)) : undefined, [card]);

    const disableSave = isSaving || cardLoading || (!card && !cardProtected) || Boolean(cardError) || Boolean(unsupported)
        || Boolean(secretError);

    if (loadFailed) {
        return <Container><LoadError>{loadFailed}</LoadError></Container>;
    }
    if (isLoading || !nodeRef.current || !targetLineRangeRef.current) {
        return <Container><FormLoadingState /></Container>;
    }
    return (
        <Container>
            <FlowNodeForm
                ref={formRef}
                fileName={fileNameRef.current}
                targetLineRange={targetLineRangeRef.current}
                nodeFormTemplate={templateRef.current}
                node={nodeRef.current}
                submitText={isSaving ? "Saving..." : editing ? "Save" : "Add as Tool"}
                onSubmit={handleSave}
                onChange={(fieldKey, value) => {
                    if (fieldKey === AGENT_FIELD_KEY) {
                        const next = stringOf(value);
                        if (next !== agentValue) {
                            setAgentValue(next);
                            clearCard();
                        }
                    } else if (fieldKey === SECRET_FIELD_KEY) {
                        setSecretValue(stringOf(value));
                    } else if (fieldKey === VARIABLE_FIELD_KEY && value && value !== autoNameRef.current) {
                        nameEditedRef.current = true;
                    }
                }}
                showProgressIndicator={isSaving}
                disableSaveButton={disableSave}
                injectedComponents={injectedComponents}
                fieldOverrides={fieldOverrides}
                customValidator={customValidator}
            />
        </Container>
    );
}

export default AddRemoteAgent;
