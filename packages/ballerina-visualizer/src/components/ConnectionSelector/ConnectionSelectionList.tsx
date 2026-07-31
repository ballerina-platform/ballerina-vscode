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

import { useEffect, useRef, useState } from "react";
import { Category, CardList } from "@wso2/ballerina-side-panel";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { RelativeLoader } from "../RelativeLoader";
import { ConnectionSearchConfig, ConnectionSelectionListProps } from "./types";
import { convertConnectionCategories, getSearchConfig } from "./utils";
import { getAiModuleOrg } from "../../views/BI/AIChatAgent/utils";
import { AI_COMPONENT_PROGRESS_MESSAGE, AI_COMPONENT_PROGRESS_MESSAGE_TIMEOUT, LOADING_MESSAGE } from "../../constants";
import { LoaderContainer } from "../RelativeLoader/styles";

export function ConnectionSelectionList(props: ConnectionSelectionListProps): JSX.Element {
    const { connectionKind, selectedNode, onSelect, expandedGroupId, onExpandedGroupChange } = props;

    const { rpcClient } = useRpcContext();
    const [connectionCategories, setConnectionCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState<boolean>(false);
    const [progressMessage, setProgressMessage] = useState<string>(LOADING_MESSAGE);

    const projectPath = useRef<string>("");
    const aiModuleOrg = useRef<string>("");
    const searchConfig = useRef<ConnectionSearchConfig>();
    const progressTimeoutRef = useRef<number | null>(null);

    useEffect(() => {
        initPanel();
        return () => {
            if (progressTimeoutRef.current) {
                clearTimeout(progressTimeoutRef.current);
                progressTimeoutRef.current = null;
            }
        };
    }, []);

    const initPanel = async () => {
        setLoading(true);
        projectPath.current = await rpcClient.getVisualizerLocation().then((location) => location.projectPath);
        aiModuleOrg.current = await getAiModuleOrg(rpcClient, selectedNode?.codedata?.node);
        searchConfig.current = getSearchConfig(connectionKind, aiModuleOrg.current);
        progressTimeoutRef.current = setTimeout(() => {
            setProgressMessage(AI_COMPONENT_PROGRESS_MESSAGE);
            progressTimeoutRef.current = null;
        }, AI_COMPONENT_PROGRESS_MESSAGE_TIMEOUT);
        await fetchConnections();
        setLoading(false);
    };

    const fetchConnections = async () => {
        const connectionSearchResponse = await rpcClient.getBIDiagramRpcClient().search({
            filePath: projectPath.current,
            queryMap: {
                q: searchConfig.current.query
            },
            searchKind: searchConfig.current.searchKind
        });

        setConnectionCategories(convertConnectionCategories(connectionKind, connectionSearchResponse.categories));
    };

    return (
        <>
            {loading && (
                <LoaderContainer>
                    <RelativeLoader message={progressMessage} />
                </LoaderContainer>
            )}
            {!loading && connectionCategories.length > 0 && (
                <CardList
                    categories={connectionCategories}
                    onSelect={onSelect}
                    expandedGroupId={expandedGroupId}
                    onExpandedGroupChange={onExpandedGroupChange}
                />
            )}
        </>
    );
}
