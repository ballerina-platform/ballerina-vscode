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

import { useEffect } from "react";
import styled from "@emotion/styled";
import {
    ContextAwareRawExpressionEditor,
    FormField,
    InputMode,
    ModeSwitcherProvider,
    useFormContext,
} from "@wso2/ballerina-side-panel";
import { InputType } from "@wso2/ballerina-core";

const FieldWrapper = styled.div`
    width: 100%;
    margin-bottom: 8px;
`;

// Strip surrounding quotes / the `string `...`` template wrapper.
function stripWrappingQuotes(str: string): string {
    if (str.startsWith("string `") && str.endsWith("`")) {
        return str.slice("string `".length, -1);
    }
    if (
        ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) &&
        !(str.startsWith('""') || str.startsWith("''"))
    ) {
        return str.slice(1, -1);
    }
    return str;
}

const PROMPT_INPUT_TYPE: InputType = { fieldType: "PROMPT", ballerinaType: "ai:Prompt", selected: true };

const PROMPT_FIELDS = [
    { key: "role", label: "Role", documentation: "The role or responsibility assigned to the agent" },
    { key: "instructions", label: "Instructions", documentation: "Specific instructions for the agent" },
] as const;

function buildField(key: string, label: string, documentation: string, value: string): FormField {
    return { key, label, type: "PROMPT", optional: true, editable: false, enabled: true, documentation, value, types: [PROMPT_INPUT_TYPE] };
}

function ReadonlyPromptField({ field }: { field: FormField }) {
    return (
        <FieldWrapper>
            <ModeSwitcherProvider
                inputMode={InputMode.PROMPT}
                onModeChange={() => { }}
                types={[]}
                isRecordTypeField={false}
                isModeSwitcherEnabled={false}
            >
                <ContextAwareRawExpressionEditor field={field} fieldInputType={PROMPT_INPUT_TYPE} />
            </ModeSwitcherProvider>
        </FieldWrapper>
    );
}

interface AgentPromptDisplayProps {
    role?: string;
    instructions?: string;
}

// Read-only Role + Instructions for a custom agent (AGENT_TYPE). These keys aren't node properties,
// so updateNodeProperties ignores them on save.
export function AgentPromptDisplay({ role, instructions }: AgentPromptDisplayProps) {
    const { form } = useFormContext();
    const values: Record<string, string> = {
        role: role ? stripWrappingQuotes(role) : "",
        instructions: instructions ? stripWrappingQuotes(instructions) : "",
    };
    const fields = PROMPT_FIELDS.filter((field) => values[field.key]);

    useEffect(() => {
        fields.forEach((field) => form.setValue(field.key, values[field.key], { shouldDirty: false }));
    }, [values.role, values.instructions]);

    if (fields.length === 0) {
        return null;
    }

    return (
        <>
            {fields.map((field) => (
                <ReadonlyPromptField key={field.key} field={buildField(field.key, field.label, field.documentation, values[field.key])} />
            ))}
        </>
    );
}
