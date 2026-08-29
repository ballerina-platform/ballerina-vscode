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

import React, { useMemo } from "react";
import { BallerinaRpcClient, Context } from "@wso2/ballerina-rpc-client";
import { BiWsClient } from "../../wsManager/WsClient";
import { FormHostCapabilities, FormHostCapabilitiesContext } from "../../Forms/formHostCapabilities";

// Pre-project, forms must not offer type creation: the type editor resolves its
// file from the visualizer state machine (absent here), and a type created in the
// throwaway staging scaffold would never reach the generated integration.
const WIZARD_FORM_CAPABILITIES: FormHostCapabilities = { typeCreation: false };

/**
 * Wraps a manager stub so an undefined method resolves to `undefined` with a warning
 * instead of crashing the render.
 */
function withFallback<T extends object>(managerName: string, real: T): T {
    return new Proxy(real, {
        get(target, prop, receiver) {
            const value = Reflect.get(target, prop, receiver);
            // 'then' must stay undefined so the manager object is not thenable.
            if (value !== undefined || typeof prop !== "string" || prop === "then") {
                return value;
            }
            return async (): Promise<undefined> => {
                console.warn(`[CreateIntegrationWizard] Stubbed pre-project rpc call: ${managerName}.${prop}`);
                return undefined;
            };
        },
    }) as T;
}

function createWizardRpcAdapter(wsClient: BiWsClient): BallerinaRpcClient {
    const noopUnsubscribe = () => { };

    const biDiagramRpcClient = withFallback("BIDiagram", {
        getExpressionCompletions: async () => [] as any,
        getDataMapperCompletions: async () => [] as any,
        getExpressionDiagnostics: (params: any) => wsClient.getExpressionDiagnostics(params),
        getSignatureHelp: async () => ({ signatures: [] as any[], activeSignature: 0, activeParameter: 0 }),
        getVisibleTypes: async () => [] as any,
        getExpressionTokens: async () => [] as number[],
        // Import statements are applied at generation time (post-reload) from the
        // collected form imports — nothing to offset pre-project.
        updateImports: async () => ({ importStatementOffset: 0 }),
        getNodeTemplate: (params: any) => wsClient.getNodeTemplate(params),
    });

    const serviceDesignerRpcClient = withFallback("ServiceDesigner", {
        getResourceReturnTypes: async () => [] as any,
        getTriggerModels: (params: any) => wsClient.getTriggerModels(params),
        getServiceInitModel: (params: any) => wsClient.getServiceInitModel(params),
    });

    const visualizerRpcClient = withFallback("Visualizer", {
        // Navigation is meaningless pre-project — the wizard owns view flow.
        openView: async () => { },
        getThemeKind: async () =>
            document.body.classList.contains("vscode-light") ? "light" : "dark",
    });

    const commonRpcClient = withFallback("Common", {
        showErrorMessage: (params: any) => wsClient.showErrorMessage(params),
        // FILE_SELECT / PROJECT_FILE_SELECT pickers go over the WS bridge. `allowOutsideProject`
        // is forced: pre-project the host would otherwise offer to copy the spec into whatever
        // project happens to be open.
        selectFileOrDirPath: (params: any) => wsClient.selectFileOrDirPath({ ...params, allowOutsideProject: true }),
        selectProjectRelativeFile: (params: any) => wsClient.selectProjectRelativeFile({ ...params, allowOutsideProject: true }),
        selectFileOrFolderPath: () => wsClient.selectFileOrFolderPath(),
    });

    const adapter = {
        getBIDiagramRpcClient: () => biDiagramRpcClient,
        getServiceDesignerRpcClient: () => serviceDesignerRpcClient,
        getVisualizerRpcClient: () => visualizerRpcClient,
        getCommonRpcClient: () => commonRpcClient,
        // Pre-project there is no visualizer state machine — an empty location
        // reads as "no view/project" to consumers (e.g. ParamManager's GraphQL check).
        getVisualizerLocation: async () => ({} as any),
        onThemeChanged: (_callback: (kind: unknown) => void) => noopUnsubscribe,
    };

    // Unknown getters return an all-stub manager; unknown methods resolve to {} so
    // `(await x()).prop` is safe.
    return new Proxy(adapter, {
        get(target, prop, receiver) {
            const value = Reflect.get(target, prop, receiver);
            if (value !== undefined || typeof prop !== "string" || prop === "then") {
                return value;
            }
            if (prop.startsWith("get") && prop.endsWith("RpcClient")) {
                const manager = withFallback(prop.slice(3).replace(/RpcClient$/, ""), {});
                return () => manager;
            }
            return async (): Promise<any> => {
                console.warn(`[CreateIntegrationWizard] Stubbed pre-project rpc call: rpcClient.${prop}`);
                return {};
            };
        },
    }) as unknown as BallerinaRpcClient;
}

interface WizardRpcAdapterProviderProps {
    wsClient: BiWsClient;
    children: React.ReactNode;
}

/** Mounts the rpc-client React context with the WS-backed adapter so `useRpcContext()` works
 *  pre-project, and restricts form-host capabilities for every form in the wizard. */
export function WizardRpcAdapterProvider({ wsClient, children }: WizardRpcAdapterProviderProps) {
    const rpcClient = useMemo(() => createWizardRpcAdapter(wsClient), [wsClient]);
    const value = useMemo(() => ({ rpcClient }), [rpcClient]);
    return (
        <Context.Provider value={value}>
            <FormHostCapabilitiesContext.Provider value={WIZARD_FORM_CAPABILITIES}>
                {children}
            </FormHostCapabilitiesContext.Provider>
        </Context.Provider>
    );
}
