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

export enum ServiceType {
    HTTP = 'HTTP',
    AGENT = 'AI Agent',
    GRAPHQL = 'GraphQL',
    MCP = 'MCP'
}

// Match the module prefix, not a substring of the whole name: 'mcp:StreamableHttpService'
// contains 'Http'. The anonymous-listener path builds the type from source code, so the
// prefix arrives with the listener's leading trivia attached, comments included.
export function resolveServiceType(type: string): ServiceType | undefined {
    if (!type) {
        return undefined;
    }

    switch (type.replace(/\/\/[^\n]*/g, '').split(':')[0].trim().toLowerCase()) {
        case 'http':
            return ServiceType.HTTP;
        case 'graphql':
            return ServiceType.GRAPHQL;
        case 'mcp':
            return ServiceType.MCP;
        case 'ai':
            return ServiceType.AGENT;
        default:
            return undefined;
    }
}
