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

import { useEffect, useMemo, useState } from "react";
import styled from "@emotion/styled";
import { ArtifactData, FlowNode, getPrimaryInputType, NodePosition, Property, RecordTypeField }
    from "@wso2/ballerina-core";
import { FieldGroup, FormField, FormValues } from "@wso2/ballerina-side-panel";
import { Icon } from "@wso2/ui-toolkit";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import ArtifactForm from "../Forms/ArtifactForm";
import { RelativeLoader } from "../../../components/RelativeLoader";
import { ImplementationBadge } from "../../../components/ImplementationBadge";
import { convertNodePropertyToFormField } from "../../../utils/bi";
import { INCLUDE_CONTEXT_KEY, OAUTH_GROUP, RESULT_TYPE_GROUP, buildIncludeContextField } from "./toolForm";
import { addToolToAgentNode, AgentToolHostClass, buildAgentCallToolNode, fetchAgentRunReturnType, fetchOAuthConfigProperties, refreshAgentNodeLineRange, resolveAgentNodePosition, ZERO_LINE_RANGE } from "./utils";
import { buildAgentToolFields, stripCodeFencesInline } from "./formUtils";

const LoaderContainer = styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100%;
`;

interface UseAgentToolFormProps {
    agentNode?: FlowNode;
    agentVarName: string;
    agentReceiver?: string;
    agentLabel?: string;
    submitText?: string;
    artifactData?: ArtifactData;
    onBeforeSave?: () => Promise<void>;
    onSave?: (agentPosition?: NodePosition) => void;
    onToolSaved?: (toolName: string) => void;
    hostClass?: AgentToolHostClass;
}

export function UseAgentToolForm(props: UseAgentToolFormProps): JSX.Element {
    const { agentNode, agentVarName, agentReceiver, agentLabel = agentVarName, submitText = "Save Tool", onBeforeSave,
        onSave, onToolSaved, hostClass, artifactData } = props;
    const { rpcClient } = useRpcContext();

    const [agentFilePath, setAgentFilePath] = useState<string>("");
    const [ready, setReady] = useState<boolean>(false);
    const [saving, setSaving] = useState<boolean>(false);
    const [oauthProperties, setOauthProperties] = useState<{ key: string; property: Property }[]>([]);
    const [defaultReturnType, setDefaultReturnType] = useState<string>("");

    useEffect(() => {
        (async () => {
            const filePath = hostClass
                ? hostClass.filePath
                : (await rpcClient.getVisualizerRpcClient().joinProjectPath({
                    segments: [agentNode?.codedata?.lineRange?.fileName ?? "agents.bal"],
                })).filePath;
            setAgentFilePath(filePath);
            setOauthProperties(await fetchOAuthConfigProperties(rpcClient, filePath));
            setDefaultReturnType(await fetchAgentRunReturnType(rpcClient, filePath, agentVarName,
                hostClass?.className));
            setReady(true);
        })();
    }, [agentNode]);

    const oauthFields = useMemo<FormField[]>(
        () => oauthProperties.map(({ key, property }) => ({
            ...convertNodePropertyToFormField(key, property),
            group: OAUTH_GROUP,
            advanced: false,
        })),
        [oauthProperties]
    );

    const groups = useMemo<FieldGroup[]>(
        () => [
            ...(oauthFields.length > 0
                ? [{ id: OAUTH_GROUP, label: "OAuth Client Configuration", defaultCollapsed: true }]
                : []),
            { id: RESULT_TYPE_GROUP, label: "Result Type", defaultCollapsed: true },
        ],
        [oauthFields]
    );

    const recordTypeFields = useMemo<RecordTypeField[]>(
        () => oauthProperties
            .filter(({ property }) => getPrimaryInputType(property?.types)?.typeMembers
                ?.some((member) => member.kind === "RECORD_TYPE"))
            .map(({ key, property }) => ({
                key,
                property,
                recordTypeMembers: getPrimaryInputType(property?.types)?.typeMembers
                    .filter((member) => member.kind === "RECORD_TYPE"),
            })),
        [oauthProperties]
    );

    const fields = useMemo<FormField[]>(() => [
        ...buildAgentToolFields(
            `${agentVarName}Tool`,
            `Delegates a query to ${agentLabel === "Agent" ? "the generic agent" : agentLabel}.`
        ),
        // No inputs card on this form — the delegated call's only input is the query — so the
        // context flag sits with the fields instead.
        buildIncludeContextField() as FormField,
        ...oauthFields,
        {
            key: "returnType",
            label: "Result Type",
            type: "TYPE",
            optional: true,
            editable: true,
            documentation: "The data type this tool will return to the agent.",
            value: defaultReturnType,
            placeholder: "string",
            types: [{ fieldType: "TYPE", selected: true }],
            group: RESULT_TYPE_GROUP,
            advanced: false,
            enabled: true,
        },
    ], [agentVarName, agentLabel, oauthFields, defaultReturnType]);

    // Send only an edited value. Passing the prefill back would make the LS skip its own
    // resolution, which is what adds the import for a type from another module.
    const overriddenReturnType = (submitted: string): string =>
        submitted.trim() === defaultReturnType.trim() ? "" : submitted;

    const handleSubmit = async (data: FormValues) => {
        if (saving) {
            return;
        }
        setSaving(true);
        try {
            await onBeforeSave?.();
            const toolName = String(data["name"] ?? "").trim() || `${agentVarName}Tool`;
            const description = stripCodeFencesInline(String(data["description"] ?? ""));
            const toolFilePath = hostClass ? hostClass.filePath : agentFilePath;
            const toolNode = buildAgentCallToolNode(toolName, agentVarName, data[INCLUDE_CONTEXT_KEY] === true,
                description, hostClass, agentReceiver, overriddenReturnType(String(data["returnType"] ?? "")));

            // Same shape the connection tool form uses: codedata.data.auth.
            const authConfig: Record<string, string> = {};
            for (const { key } of oauthProperties) {
                const value = data[key];
                if (value !== undefined && value !== "") {
                    authConfig[key] = String(value);
                }
            }
            if (Object.keys(authConfig).length > 0) {
                toolNode.codedata.data = { ...toolNode.codedata.data, auth: JSON.stringify(authConfig) };
            }

            const toolResponse = await rpcClient.getBIDiagramRpcClient().getSourceCode({
                filePath: toolFilePath,
                flowNode: toolNode,
                artifactData,
            });
            let agentPosition: NodePosition | undefined;
            if (!hostClass && agentNode) {
                const updatedAgentNode = await addToolToAgentNode(agentNode, toolName);
                if (updatedAgentNode) {
                    await refreshAgentNodeLineRange(updatedAgentNode, rpcClient, toolResponse?.artifacts);
                    const { filePath: agentFile } = await rpcClient.getVisualizerRpcClient().joinProjectPath({
                        segments: [updatedAgentNode.codedata.lineRange.fileName],
                    });
                    await rpcClient
                        .getBIDiagramRpcClient()
                        .getSourceCode({ filePath: agentFile, flowNode: updatedAgentNode });
                    agentPosition = await resolveAgentNodePosition(updatedAgentNode, rpcClient);
                }
            }
            onToolSaved?.(toolName);
            onSave?.(agentPosition);
        } catch (error) {
            console.error("Failed to add agent as a tool", error);
        } finally {
            setSaving(false);
        }
    };

    if (!ready) {
        return (
            <LoaderContainer>
                <RelativeLoader />
            </LoaderContainer>
        );
    }

    return (
        <ArtifactForm
            preserveFieldOrder={false}
            fileName={agentFilePath}
            targetLineRange={ZERO_LINE_RANGE}
            fields={fields}
            groups={groups}
            recordTypeFields={recordTypeFields}
            onSubmit={handleSubmit}
            submitText={submitText}
            isSaving={saving}
            helperPaneSide="left"
            injectedComponents={[
                {
                    component: (
                        <ImplementationBadge title={agentLabel}>
                            <Icon name="bi-ai-agent" sx={{ width: 14, height: 14, fontSize: 14 }} />
                            {agentLabel}
                        </ImplementationBadge>
                    ),
                    index: 0,
                },
            ]}
        />
    );
}
