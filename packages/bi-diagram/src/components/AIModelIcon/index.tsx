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

import React from "react";
import { DefaultLlmIcon, Icon, getAIModuleIcon } from "@wso2/ui-toolkit";
import { CodeData, GET_DEFAULT_EMBEDDING_PROVIDER, GET_DEFAULT_MODEL_PROVIDER } from "@wso2/ballerina-core";
import { NodeIcon } from "../NodeIcon";

interface AIModelIconProps {
    type: string;
    codedata?: CodeData;
    iconUrl?: string;
}

export function AIModelIcon(props: AIModelIconProps): React.ReactElement {
    const { type, codedata, iconUrl } = props;

    if (codedata && isWso2Module(codedata)) {
        return <Icon name="bi-wso2" sx={{ width: 24, height: 24, fontSize: 24 }} />;
    }

    const icon = getAIModuleIcon(type, 24);
    if (icon) {
        return icon;
    }

    // Fallback to icon URL from metadata (fetched from Central)
    // Skip for ballerina/ai core module — its CDN icon is generic; node-type icons are better
    if (iconUrl && (codedata?.module !== "ai" && codedata?.module !== "ai.devant")) {
        return <img src={iconUrl} style={{ width: 24, height: 24 }} />;
    }

    if (codedata?.node) {
        return <NodeIcon type={codedata?.node} size={24} />;
    }
    return <DefaultLlmIcon />;
}

export function isWso2Module(codedata: CodeData): boolean {
    if (codedata?.module === "ai") {
        if (["Wso2ModelProvider", "Wso2EmbeddingProvider"].includes(codedata.object)) {
            return true;
        }
        if ([GET_DEFAULT_MODEL_PROVIDER, GET_DEFAULT_EMBEDDING_PROVIDER].includes(codedata.symbol)) {
            return true;
        }
    }
    return false;
}
