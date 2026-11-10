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

import { useQueryClient, useQuery } from "@tanstack/react-query";
import { PlatformExtState } from "@wso2/ballerina-core/lib/rpc-types/platform-ext/interfaces";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { PlatformExtRpcClient } from "@wso2/ballerina-rpc-client/lib/rpc-clients/platform-ext/platform-ext-client";
import {
    ConnectionListItem,
    ICreateDirCtxCmdParams,
    WICommandIds,
} from "@wso2/wso2-platform-core";
import React, { useContext, FC, ReactNode, useEffect, useState } from "react";

const defaultPlatformExtContext: {
    platformExtState: PlatformExtState | null;
    devantConsoleUrl: string;
    platformRpcClient?: PlatformExtRpcClient;
    onLinkDevantProject: () => void;
    loginToDevant: () => void;
    handleLinkWorkspace: () => Promise<void>
    importConnection: {
        connection?: ConnectionListItem;
        setConnection: (item?: ConnectionListItem) => void;
    };
} = {
    platformExtState: { integrations: [], isLoggedIn: false, session: null },
    onLinkDevantProject: () => {},
    loginToDevant: () => {},
    handleLinkWorkspace: async () => {},
    devantConsoleUrl: "",
    importConnection: { setConnection: () => {} },
};

const PlatformExtContext = React.createContext(defaultPlatformExtContext);

export const usePlatformExtContext = () => {
    return useContext(PlatformExtContext) || defaultPlatformExtContext;
};

export const PlatformExtContextProvider: FC<{ children: ReactNode }> = ({ children }) => {
    const queryClient = useQueryClient();
    const { rpcClient } = useRpcContext();
    const platformRpcClient = rpcClient.getPlatformRpcClient();
    const [importingConn, setImportingConn] = useState<ConnectionListItem>();

    const { data: platformExtState } = useQuery({
        queryKey: ["platform-ext-state"],
        queryFn: () => platformRpcClient.getPlatformStore(),
    });

    useEffect(() => {
        platformRpcClient?.onPlatformExtStoreStateChange((state) => {
            queryClient.setQueryData(["platform-ext-state"], state);
        });
    }, []);

    const { data: devantConsoleUrl = "" } = useQuery({
        queryKey: ["console-url"],
        queryFn: () => platformRpcClient.getDevantConsoleUrl(),
    });

    const loginToDevant = () => {
        rpcClient.getCommonRpcClient().executeCommand({
            commands: [WICommandIds.SignIn],
        })
    }

    const handleLinkWorkspace = async () => {
        const visualizerLocation = await rpcClient.getVisualizerLocation();
        rpcClient.getCommonRpcClient().executeCommand({
            commands: [
                WICommandIds.CreateDirectoryContext,
                {
                    skipComponentExistCheck: true,
                    fsPath: visualizerLocation?.workspacePath || visualizerLocation?.projectPath || "",
                } as ICreateDirCtxCmdParams,
            ],
        });
    };

    const onLinkDevantProject = () => {
        if (!platformExtState?.isLoggedIn && platformExtState?.hasPossibleComponent) {
            rpcClient
                .getCommonRpcClient()
                .showInformationModal({
                    message: "Please login to WSO2 Integration Platform in order to use WSO2 Cloud connections",
                    items: ["Login"],
                })
                .then((resp) => {
                    if (resp === "Login") {
                        platformRpcClient.deployIntegrationInDevant();
                    } else if (resp === "Associate Project") {
                        loginToDevant();
                    }
                });
        } else {
            rpcClient
                .getCommonRpcClient()
                .showInformationModal({
                    message:
                        "To use WSO2 Cloud connections, you can either deploy your source code now or associate this directory with an existing WSO2 Cloud project where you plan to deploy later.",
                    items: ["Deploy Now", "Associate Project"],
                })
                .then(async (resp) => {
                    if (resp === "Deploy Now") {
                        platformRpcClient.deployIntegrationInDevant();
                    } else if (resp === "Associate Project") {
                        handleLinkWorkspace();
                    }
                });
        }
    };

    return (
        <PlatformExtContext.Provider
            value={{
                platformExtState: {
                    ...platformExtState,
                    selectedContext: platformExtState?.isLoggedIn ? platformExtState.selectedContext : undefined,
                    selectedIntegration: platformExtState?.isLoggedIn ? platformExtState.selectedIntegration : undefined,
                    integrations: platformExtState?.isLoggedIn ? platformExtState.integrations : [],
                    devantConns: platformExtState?.isLoggedIn ? platformExtState.devantConns : {},
                },
                loginToDevant,
                handleLinkWorkspace,
                devantConsoleUrl,
                platformRpcClient,
                onLinkDevantProject,
                importConnection: { setConnection: (item) => setImportingConn(item), connection: importingConn },
            }}
        >
            {children}
        </PlatformExtContext.Provider>
    );
};
