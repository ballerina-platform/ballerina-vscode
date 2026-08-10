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

import React, { CSSProperties } from "react";
import { Icon, getAIModuleIcon, AI_MODULE_TYPES } from "@wso2/ui-toolkit";
import { ApiIcon } from "../../resources";
import { CodeData, isAgentCallNode } from "@wso2/ballerina-core";
import { isWso2Module } from "../AIModelIcon";

interface ConnectorIconProps {
    url?: string;
    fallbackIcon?: React.ReactNode;
    style?: CSSProperties; // Custom style for images
    className?: string;
    codedata?: CodeData;
    connectorType?: string;
}

export function ConnectorIcon(props: ConnectorIconProps): React.ReactElement {
    const { url, fallbackIcon, className, style, codedata, connectorType } = props;
    const [imageError, setImageError] = React.useState(false);

    // use custom icon for http
    if (url?.includes("ballerina_http_")) {
        return <Icon name="bi-globe" className={className} sx={{ width: 24, height: 24, fontSize: 24, ...style }} />;
    }

    // use custom SVG icon for known ai model providers (supports light/dark mode)
    if (AI_MODULE_TYPES.some((module) => url?.includes(module))) {
        const selectedModule = AI_MODULE_TYPES.find((module) => url?.includes(module));
        const icon = selectedModule ? getAIModuleIcon(selectedModule) : null;
        if (icon) return icon;
        // if no hardcoded icon, fall through to URL-based icon below
    }

    // use custom icon for mcp
    if (url?.includes("mcp")) {
        return <Icon name="bi-mcp" className={className} sx={{ width: 24, height: 24, fontSize: 24, ...style }} />;
    }

    // use custom icon for wso2 module
    if (codedata && isWso2Module(codedata) || url?.includes("wso2_icon")) {
        return <Icon name="bi-wso2" className={className} sx={{ width: 24, height: 24, fontSize: 24, ...style }} />;
    }

    // use custom icon for ai agent calls
    if ((url?.includes("ballerinax_ai_") || url?.includes("ballerina_ai")) && codedata && isAgentCallNode(codedata.node)) {
        return <Icon name="bi-ai-agent" className={className} sx={{ width: 24, height: 24, fontSize: 24, ...style }} />;
    }

    if (url && isValidUrl(url) && !imageError) {
        return <img src={url} className={className} onError={() => setImageError(true)} style={{ ...style }} />;
    }

    if (url && (!isValidUrl(url) || imageError) && connectorType === "persist") {
        return <Icon name="bi-db" className={className} sx={{ width: 24, height: 24, fontSize: 24, ...style }} />;
    }

    if (fallbackIcon) {
        return <div className={className}>{fallbackIcon}</div>;
    }

    return (
        <div style={style} className={className}>
            <ApiIcon />
        </div>
    );
}

function isValidUrl(url: string): boolean {
    try {
        new URL(url);
        return true;
    } catch (error) {
        return false;
    }
}


export default ConnectorIcon;
