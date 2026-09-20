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

import React, { ReactNode, useCallback, useMemo, useRef, useState, createContext, useContext } from "react";
import { BallerinaRpcClient, VisualizerContext as RpcContext, Context } from "@wso2/ballerina-rpc-client";
import { NodePosition, STNode } from "@wso2/syntax-tree";
import { ConnectorInfo, TriggerModelsResponse } from "@wso2/ballerina-core";

export function RpcContextProvider({ children }: { children: ReactNode }) {
    const rpcClient = useRef(new BallerinaRpcClient());

    const contextValue: RpcContext = {
        rpcClient: rpcClient.current,
    };

    return <Context.Provider value={contextValue}>{children}</Context.Provider>;
}



export enum PanelType {
    STATEMENTEDITOR = "STATEMENTEDITOR",
    CONSTRUCTPANEL = "CONSTRUCTPANEL",
};

interface PanelDetails {
    isActive: boolean;
    name?: PanelType;
    contentUpdated?: boolean;
}

interface ComponentInfo {
    model: STNode;
    position: NodePosition;
    componentType: string;
    connectorInfo?: ConnectorInfo;
}

interface ActiveFileInfo {
    fullST: STNode;
    filePath: string;
    activeSequence: STNode;
}

export type SidePanel = "EMPTY" | "RECORD_EDITOR" | "ADD_CONNECTION" | "ADD_ACTION";

interface VisualizerContext {
    popupMessage: boolean;
    setPopupMessage: (value: boolean) => void;
    sidePanel: SidePanel;
    screenMetadata: any;
    setSidePanel: (panel: SidePanel) => void;
    setScreenMetadata: (metadata: any) => void;
    activePanel: PanelDetails;
    setActivePanel: (panelDetails: PanelDetails) => void;
    statementPosition: NodePosition;
    setStatementPosition: (position: NodePosition) => void;
    activeFileInfo?: ActiveFileInfo;
    setActiveFileInfo?: (activeFileInfo: ActiveFileInfo) => void;
    componentInfo?: ComponentInfo;
    setComponentInfo?: (componentInfo: ComponentInfo) => void;
    cacheTriggers: TriggerModelsResponse,
    setCacheTriggers: (componentInfo: TriggerModelsResponse) => void;
    showOverlay: boolean;
    setShowOverlay: (value: boolean) => void;
}

export const VisualizerContext = createContext({
    activePanel: { isActive: false },
    setActivePanel: (panelDetails: PanelDetails) => { },
    statementPosition: undefined,
    setStatementPosition: (position: NodePosition) => { },
    activeFileInfo: undefined,
    setActiveFileInfo: (activeFileInfo: ActiveFileInfo) => { },
    componentInfo: undefined,
    setComponentInfo: (componentInfo: ComponentInfo) => { },
    cacheTriggers: undefined,
    setCacheTriggers: (triggers: TriggerModelsResponse) => { },
    setShowOverlay: (value: boolean) => { },

} as VisualizerContext);

export function VisualizerContextProvider({ children }: { children: ReactNode }) {
    const [popupMessage, setPopupMessage] = useState(false);
    const [sidePanel, setSidePanel] = useState("EMPTY" as SidePanel);
    const [metadata, setMetadata] = useState({} as any);
    const [activePanel, setActivePanel] = useState({ isActive: false });
    const [statementPosition, setStatementPosition] = useState<NodePosition>();
    const [componentInfo, setComponentInfo] = useState<ComponentInfo>();
    const [activeFileInfo, setActiveFileInfo] = useState<ActiveFileInfo>();
    const [cacheTriggers, setCacheTriggers] = useState<TriggerModelsResponse>({ local: [] });
    const [showOverlay, setShowOverlay] = useState(false);


    const contextValue: VisualizerContext = {
        popupMessage: popupMessage,
        screenMetadata: metadata,
        setPopupMessage: setPopupMessage,
        sidePanel: sidePanel,
        setSidePanel: setSidePanel,
        setScreenMetadata: setMetadata,
        activePanel: activePanel,
        setActivePanel: setActivePanel,
        statementPosition: statementPosition,
        setStatementPosition: setStatementPosition,
        activeFileInfo: activeFileInfo,
        setActiveFileInfo: setActiveFileInfo,
        componentInfo: componentInfo,
        setComponentInfo: setComponentInfo,
        cacheTriggers: cacheTriggers,
        setCacheTriggers: setCacheTriggers,
        showOverlay: showOverlay,
        setShowOverlay: setShowOverlay
    };

    return <VisualizerContext.Provider value={contextValue}>{children}</VisualizerContext.Provider>;
}

export const useVisualizerContext = () => useContext(VisualizerContext);

export const POPUP_IDS = {
  VARIABLE: "VARIABLE",
  FUNCTION: "FUNCTION",
  CONFIGURABLES: "CONFIGURABLES",
  RECORD_CONFIG: "RECORD_CONFIG",
  LIBRARY_BROWSER: "LIBRARY_BROWSER",
  ATTACH_LISTENER: "ATTACH_LISTENER",
  DOCUMENT_URL: "DOCUMENT_URL",
} as const;

export type ModalStackItem = {
    modal: ReactNode;
    id: string;
    title: string;
    height?: number;
    width?: number;
    onClose?: () => void;
}

interface ModalStackContext {
    modalStack: ModalStackItem[];
    addModal: (modal: ReactNode, id: string, title: string, height?: number, width?: number, onClose?: () => void) => void;
    updateModal: (id: string, updates: Partial<Omit<ModalStackItem, "id">>) => void;
    popModal: () => void;
    closeModal: (id: string) => void;
    popToModal: (id: string) => void;
    clearModals: () => void;
}

export const ModalStackContext = createContext({
    modalStack: [],
    addModal: (modal: ReactNode, id: string, title: string, height?: number, width?: number, onClose?: () => void) => { },
    updateModal: (id: string, updates: Partial<Omit<ModalStackItem, "id">>) => { },
    popModal: () => { },
    closeModal: (id: string) => { },
    popToModal: (id: string) => { },
    clearModals: () => { },
} as ModalStackContext);

export const ModalStackProvider = ({children}: {children: ReactNode}) => {
    const [modalStack, setModalStack] = useState<ModalStackItem[]>([]);
    const stackRef = useRef<ModalStackItem[]>([]);

    // Notifies dropped entries outside the state updater, which React may invoke twice.
    const commit = useCallback((next: (stack: ModalStackItem[]) => ModalStackItem[]) => {
        const previous = stackRef.current;
        const kept = next(previous);
        if (kept === previous) {
            return;
        }
        stackRef.current = kept;
        setModalStack(kept);
        previous
            .filter((item) => !kept.includes(item))
            .reverse()
            .forEach((item) => item.onClose?.());
    }, []);

    const addModal = useCallback((modal: ReactNode, id: string, title: string, height?: number, width?: number, onClose?: () => void) => {
        commit((stack) => [...stack.filter((item) => item.id !== id), { modal, id, title, height, width, onClose }]);
    }, [commit]);

    const updateModal = useCallback((id: string, updates: Partial<Omit<ModalStackItem, "id">>) => {
        commit((stack) => stack.map((item) => (item.id === id ? { ...item, ...updates } : item)));
    }, [commit]);

    const popModal = useCallback(() => {
        commit((stack) => stack.slice(0, -1));
    }, [commit]);

    const closeModal = useCallback((id: string) => {
        commit((stack) => stack.filter((item) => item.id !== id));
    }, [commit]);

    const popToModal = useCallback((id: string) => {
        commit((stack) => {
            const index = stack.findIndex((item) => item.id === id);
            return index === -1 ? stack : stack.slice(0, index + 1);
        });
    }, [commit]);

    const clearModals = useCallback(() => {
        commit((stack) => (stack.length === 0 ? stack : []));
    }, [commit]);

    const value = useMemo(
        () => ({ modalStack, addModal, updateModal, popModal, closeModal, popToModal, clearModals }),
        [modalStack, addModal, updateModal, popModal, closeModal, popToModal, clearModals]
    );

    return <ModalStackContext.Provider value={value}>{children}</ModalStackContext.Provider>;
}

export const useModalStack = () => useContext(ModalStackContext);