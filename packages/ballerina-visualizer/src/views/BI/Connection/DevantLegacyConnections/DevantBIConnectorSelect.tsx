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

import React, { useCallback, type FC } from "react";
import { useQuery } from "@tanstack/react-query";
import { AvailableNode, LinePosition } from "@wso2/ballerina-core";
import { debounce } from "lodash";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { ConnectorsGrid, SearchContainer, StyledSearchBox } from "../AddConnectionPopup/styles";
import { Codicon, ProgressRing } from "@wso2/ui-toolkit";
import ButtonCard from "../../../../components/ButtonCard";
import { ConnectorIcon } from "@wso2/bi-diagram";
import { BodyTinyInfo } from "../../../styles";

interface Props {
    target: LinePosition | null;
    fileName: string;
    onItemSelect: (availableNode: AvailableNode | undefined) => void;
}

export const DevantBIConnectorSelect: FC<Props> = (props) => {
    const { target, fileName, onItemSelect } = props;
    const { rpcClient } = useRpcContext();
    const [searchText, setSearchText] = React.useState<string>("");

    const debouncedSetSearchText = useCallback(
        debounce((value: string) => setSearchText(value), 500),
        [],
    );

    const { data: connectorList, isLoading: loadingConnectors } = useQuery({
        queryKey: ["searchConnectorsToInit", fileName, target, searchText],
        queryFn: () =>
            rpcClient.getBIDiagramRpcClient().search({
                filePath: fileName,
                queryMap: { limit: 60, q: searchText?.toLowerCase() ?? "" },
                searchKind: "CONNECTOR",
            }),
        select: (data) => {
            let resp: AvailableNode[] = [];
            if (data.categories && data.categories.length > 0) {
                if (data.categories[0]?.items) {
                    data.categories?.forEach((cat) => {
                        cat.items?.forEach((item) => {
                            if ((item as AvailableNode)?.codedata) {
                                resp.push(item as AvailableNode);
                            }
                        });
                    });
                } else {
                    data.categories?.forEach((cat) => resp.push(cat as unknown as AvailableNode));
                }
            }
            return resp;
        },
    });

    return (
        <>
            <SearchContainer>
                <StyledSearchBox
                    value={searchText}
                    placeholder="Search connectors..."
                    onChange={debouncedSetSearchText}
                    size={60}
                />
            </SearchContainer>

            {loadingConnectors ? (
                <div
                    style={{
                        display: "flex",
                        justifyContent: "center",
                        alignItems: "center",
                        padding: "40px",
                    }}
                >
                    <ProgressRing />
                </div>
            ) : (
                <>
                    {connectorList.length === 0 ? (
                        <>
                            {searchText ? (
                                <BodyTinyInfo style={{ paddingBottom: "30px" }}>
                                    No connectors matching with "{searchText}"
                                </BodyTinyInfo>
                            ) : (
                                <BodyTinyInfo style={{ paddingBottom: "30px" }}>No connectors available</BodyTinyInfo>
                            )}
                        </>
                    ) : (
                        <ConnectorsGrid>
                            {connectorList.map((availableNode, connectorIndex) => (
                                <ButtonCard
                                    id={`connector-${availableNode.metadata.label.replace(/[ .]/g, "-").toLowerCase()}`}
                                    key={availableNode.metadata.label + connectorIndex}
                                    title={availableNode.metadata.label}
                                    description={
                                        availableNode.codedata
                                            ? availableNode.codedata.org + " / " + availableNode.codedata.module
                                            : availableNode.metadata.description || ""
                                    }
                                    truncate={true}
                                    icon={
                                        availableNode.metadata.icon ? (
                                            <ConnectorIcon url={availableNode.metadata.icon} />
                                        ) : (
                                            <Codicon name="package" />
                                        )
                                    }
                                    onClick={() => onItemSelect(availableNode)}
                                />
                            ))}
                        </ConnectorsGrid>
                    )}
                </>
            )}
        </>
    );
};
