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

import { useEffect, useState } from "react";
import styled from "@emotion/styled";
import { FlowNode, LineRange, NodeKind, NodeProperties, NodePropertyKey } from "@wso2/ballerina-core";
import { FormField, FormValues } from "@wso2/ballerina-side-panel";
import { FormHeader } from "../../../../../components/FormHeader";
import { RelativeLoader } from "../../../../../components/RelativeLoader";
import ArtifactForm from "../../../Forms/ArtifactForm";
import { convertConfig } from "../../../../../utils/bi";
import { joinPath } from "../../../ProjectForm/utils";
import { BiWsClient } from "../../../wsManager/WsClient";

const LoaderContainer = styled.div`
    flex: 1;
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 48px 0;
`;

/** Fills the step's full height so the nested ArtifactForm's `footerActionButton`
 *  can pin the submit button to the bottom instead of trailing the fields. */
const FormContainer = styled.div`
    /* Fill the wizard's content column so the Configure step matches the width of
       the previous steps (Type picker / chooser) rather than a narrower 600px. */
    width: 100%;
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
`;

const FormBody = styled.div`
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
`;

/** The scaffold's functions file — the same default target the in-project
 *  FunctionForm uses (MainPanel's getDefaultFunctionsFile). */
const FUNCTIONS_FILE = "functions.bal";

const START_OF_FILE: LineRange = {
    startLine: { line: 0, offset: 0 },
    endLine: { line: 0, offset: 0 },
};

/** The artifact kinds this form covers — all three are created from a function node template. */
export type FunctionArtifactKind = "automation" | "workflow" | "durable_agent";

/** LS node kind whose template backs each card kind. */
const NODE_KIND: Record<FunctionArtifactKind, NodeKind> = {
    automation: "AUTOMATION",
    workflow: "WORKFLOW",
    durable_agent: "DURABLE_AGENT",
};

const TITLE: Record<FunctionArtifactKind, string> = {
    automation: "Automation",
    workflow: "Workflow",
    durable_agent: "Durable Agentic Workflow",
};

interface FunctionConfigureFormProps {
    wsClient: BiWsClient;
    projectRoot: string;
    kind: FunctionArtifactKind;
    isSubmitting: boolean;
    /** Hands the populated node template up to the wizard root. */
    onSubmit: (flowNode: FlowNode) => void;
}

/**
 * The Configure step for Automation, Workflow and Durable Agentic Workflow. Fetches the LS
 * node template for the scaffolded project and renders its (few) creation-time fields,
 * mirroring FunctionForm's per-kind field stripping:
 * - AUTOMATION hides functionName/type (the automation is always `main`).
 * - WORKFLOW hides isPublic/type/typeDescription (return type defaults to `error?`).
 * - DURABLE_AGENT is name-only: the model, instructions and capabilities are configured on
 *   the agent declaration afterwards. The LS prefills the name (`durableAgenticWorkflow`,
 *   deduplicated against visible symbols), so this form must not overwrite it.
 */
export function FunctionConfigureForm({ wsClient, projectRoot, kind, isSubmitting, onSubmit }: FunctionConfigureFormProps) {
    const [flowNode, setFlowNode] = useState<FlowNode | null>(null);
    const [formFields, setFormFields] = useState<FormField[]>([]);
    const [loadError, setLoadError] = useState<string | null>(null);

    const targetFilePath = joinPath(projectRoot, FUNCTIONS_FILE);
    const title = TITLE[kind];

    useEffect(() => {
        let cancelled = false;
        const fetchTemplate = async () => {
            try {
                const res = await wsClient.getNodeTemplate({
                    position: { line: 0, offset: 0 },
                    filePath: targetFilePath,
                    id: { node: NODE_KIND[kind] },
                    projectPath: projectRoot,
                });
                if (cancelled) {
                    return;
                }
                const template = res.flowNode;
                let fields = convertConfig(template.properties as NodeProperties);
                if (kind === "automation") {
                    fields = fields.filter((field) => field.key !== "functionName" && field.key !== "type");
                } else {
                    fields = fields.filter(
                        (field) => field.key !== "isPublic" && field.key !== "type" && field.key !== "typeDescription"
                    );
                }
                if (kind === "durable_agent") {
                    // Name-only create form. The description is dropped on top of the shared
                    // filter above; the template carries no `parameters` at all, since the agent
                    // is generated as a module-level declaration rather than a function.
                    fields = fields.filter((field) => field.key !== "functionNameDescription");
                }
                setFlowNode(template);
                setFormFields(fields);
            } catch (error) {
                console.error(`>>> Error fetching ${kind} node template`, error);
                if (!cancelled) {
                    setLoadError(`Failed to load the ${title.toLowerCase()} template. Please go back and try again.`);
                }
            }
        };
        fetchTemplate();
        return () => {
            cancelled = true;
        };
    }, [wsClient, projectRoot, kind]);

    const handleOnSubmit = (data: FormValues) => {
        const populated: FlowNode = { ...flowNode };
        const properties = populated.properties as NodeProperties;
        for (const [dataKey, dataValue] of Object.entries(data)) {
            const property = properties[dataKey as NodePropertyKey];
            if (property) {
                property.value = dataValue;
            }
        }
        onSubmit(populated);
    };

    if (loadError) {
        return <LoaderContainer>{loadError}</LoaderContainer>;
    }

    if (!flowNode) {
        return (
            <LoaderContainer>
                <RelativeLoader message={`Loading ${title.toLowerCase()} template...`} />
            </LoaderContainer>
        );
    }

    return (
        <FormContainer>
            <FormHeader title={`Create ${title}`} />
            <FormBody>
                <ArtifactForm
                    fileName={targetFilePath}
                    targetLineRange={START_OF_FILE}
                    fields={formFields}
                    isSaving={isSubmitting}
                    footerActionButton={true}
                    onSubmit={handleOnSubmit}
                    preserveFieldOrder={true}
                    submitText="Create Integration"
                />
            </FormBody>
        </FormContainer>
    );
}
