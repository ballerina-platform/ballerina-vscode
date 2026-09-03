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

import React, { ReactNode, useRef, useState, useLayoutEffect, createContext, useContext } from "react";
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

type ModalStackItem = {
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
    popModal: () => void;
    closeModal: (id: string) => void;
}

export const ModalStackContext = createContext({
    modalStack: [],
    addModal: (modal: ReactNode, id: string, title: string, height?: number, width?: number) => { },
    popModal: () => { },
    closeModal: (id: string) => { },
} as ModalStackContext);

export const ModalStackProvider = ({children}: {children: ReactNode}) => {
    const [modalStack, setModalStack] = useState<ModalStackItem[]>([]);

    const addModal = (modal: ReactNode, id: string, title: string, height?: number, width?: number, onClose?: () => void) => {
        setModalStack((prevStack) => [...prevStack, { modal, id, title, height, width, onClose }]);
    };

    const popModal = () => {
        setModalStack((prevStack) => prevStack.slice(0, -1));
    };

    const closeModal = (id: string) => {
        setModalStack((prevStack) => prevStack.filter((item) => item.id !== id));
    };

    return <ModalStackContext.Provider value={{ modalStack, addModal, popModal, closeModal }}>
        {children}
    </ModalStackContext.Provider>;
}

export const useModalStack = () => useContext(ModalStackContext);

export const InsideModalContext = createContext(false);

export const useInsideModal = () => useContext(InsideModalContext);

// Shared allocator so a newly-opened overlay always renders above what's already open; resets to base once everything closes so it stays under ExpandedEditor's fixed fallback (used by callers outside this package that can't reach this hook).
export const OVERLAY_ZINDEX_BASE = 2100;

let overlayOpenCount = 0;
let nextOverlayZIndex = OVERLAY_ZINDEX_BASE;

function acquireOverlayZIndex(slots: number): number {
    if (overlayOpenCount === 0) {
        nextOverlayZIndex = OVERLAY_ZINDEX_BASE;
    }
    overlayOpenCount += 1;
    const zIndex = nextOverlayZIndex;
    nextOverlayZIndex += slots;
    return zIndex;
}

function releaseOverlayZIndex(): void {
    overlayOpenCount = Math.max(0, overlayOpenCount - 1);
}

// `slots` > 1 reserves consecutive values for an overlay that stacks its own backdrop + box locally.
export function useOverlayZIndex(isOpen: boolean = true, slots: number = 1): number | undefined {
    const [zIndex, setZIndex] = useState<number>();

    useLayoutEffect(() => {
        if (!isOpen) {
            setZIndex(undefined);
            return;
        }
        setZIndex(acquireOverlayZIndex(slots));
        return () => releaseOverlayZIndex();
    }, [isOpen]);

    return zIndex;
}