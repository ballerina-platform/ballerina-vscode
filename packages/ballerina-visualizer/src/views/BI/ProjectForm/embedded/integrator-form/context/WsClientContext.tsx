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

import React, { createContext, useContext, ReactNode } from "react";
// Loose interface — the host injects its real wsClient which satisfies this structurally.
export interface WiBridgeClient {
    validateProjectPath: (params: any) => Promise<any>;
    selectFileOrDirPath: (params: any) => Promise<any>;
    getWorkspaceRoot: () => Promise<any>;
    getDefaultCreationPath: () => Promise<any>;
    getDefaultOrgName: () => Promise<any>;
    createBIProject: (params: any) => Promise<any>;
    runCommand: (params: any) => Promise<any>;
    isSupportedSLVersion: (params: any) => Promise<any>;
    getConfiguration: (params: any) => Promise<any>;
    getAuthState: () => Promise<any>;
    getContextState: () => Promise<any>;
    getConsoleUrl: () => Promise<any>;
    getCloudProjects: (params: any) => Promise<any>;
    onAuthStateChanged: (cb: (state: any) => void) => void;
    onContextStateChanged: (cb: (state: any) => void) => void;
    [key: string]: any;
}
interface VisualizerCtx { wsClient: WiBridgeClient }
const Ctx = createContext<VisualizerCtx>({ wsClient: {} as WiBridgeClient });
export const useVisualizerContext = () => useContext(Ctx);
export const WsClientProvider = ({ wsClient, children }: { wsClient: WiBridgeClient; children: ReactNode }) =>
    <Ctx.Provider value={{ wsClient }}>{children}</Ctx.Provider>;
