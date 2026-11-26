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

import React from "react";
import { Type } from "@wso2/ballerina-core";
import { FormAssist, FormAssistIntro, RunFormAssist } from "@wso2/ballerina-side-panel";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { AssistLocation, assistFormInForm } from "../form-utils";
import { applyToType, describeType } from "./typeSchema";

interface TypeFormAssistProps {
    location: AssistLocation;
    // The type as edited so far.
    draft: () => Type;
    knownTypes: () => Promise<string[]>;
    // A saved type keeps its name and kind; only its contents change.
    isNew: boolean;
    // Rebuilds the type form from the changed type.
    reseed: (type: Type) => void;
}

// Openers to finish before sending; a type has no values in scope to fill.
const NEW_TYPE_INTRO: FormAssistIntro = {
    hint: "Describe the type you need. Copilot fills in its kind, name and contents.",
    starters: ["A record with these fields: ", "An enum with these values: ", "Match this JSON sample: "],
};
// A saved type keeps its kind, so its prompts are about that kind's parts.
const TYPE_STARTERS: Record<string, string[]> = {
    RECORD: ["Add a field", "Make every field optional", "Explain this type"],
    ENUM: ["Suggest more members", "Explain this type"],
    UNION: ["Add a member type", "Explain this type"],
};

// The type form's Copilot: the header orb fills a record's fields, an enum's members, a union's types or an array's element.
export function TypeFormAssist({ location, draft, knownTypes, isNew, reseed }: TypeFormAssistProps) {
    const { rpcClient } = useRpcContext();
    // The fields' description names the project's types, which load on the first request.
    const run: RunFormAssist = async (instruction, description, requestId, context) => {
        const { groups } = describeType(draft(), await knownTypes(), isNew) ?? description;
        return assistFormInForm(rpcClient, location, { requestId, instruction, node: isNew ? "TYPE" : `TYPE (${draft().codedata?.node} ${draft().name})`, ...context, ...description, groups });
    };
    return (
        <FormAssist
            describe={() => describeType(draft(), [], isNew)}
            run={run}
            abort={(requestId) => rpcClient.getAiPanelRpcClient().abortExpressionAssist({ requestId })}
            onApply={(response) => reseed(applyToType(draft(), response, isNew))}
            intro={isNew ? NEW_TYPE_INTRO : { hint: "Describe the change. Copilot fills in the type's contents.", starters: TYPE_STARTERS[draft().codedata?.node] ?? ["Explain this type"] }}
        />
    );
}
