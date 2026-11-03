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

import React, { createContext, ReactNode } from 'react';
import { Type } from '@wso2/ballerina-core';

/**
 * A GraphQL service's request context, as the root node's context indicator summarises it.
 */
export interface RequestContextSummary {
    /** The function the service's `contextInit` names. */
    functionName?: string;
    /** The keys the context function sets, in source order. */
    keys: string[];
}

interface DiagramContextProps {
    children?: ReactNode;
    hasDiagnostics: boolean;
    focusedNodeId?: string;
    readonly?: boolean;
    setFocusedNodeId?: (id: string) => void;
    selectedNodeId?: string;
    setSelectedNodeId?: (id: string) => void;
    onEditNode?: (id: string, isGraphqlRoot?: boolean) => void;
    goToSource?: (node: Type) => void,
    onNodeDelete?: (typeId: string) => void;
    verifyTypeDelete?: (typeId: string) => Promise<boolean>;
    /** The service's request context; absent when it has none. */
    requestContext?: RequestContextSummary;
    /** Opens the request context editor; the root node offers it when given. */
    onOpenRequestContext?: () => void;
    /** Opens the service's full configuration; the root node offers it when given. */
    onOpenServiceConfig?: () => void;
}

interface IDiagramContext {
    hasDiagnostics: boolean;
    focusedNodeId?: string;
    readonly?: boolean;
    setFocusedNodeId?: (id: string) => void;
    selectedNodeId?: string;
    setSelectedNodeId?: (id: string) => void;
    onEditNode?: (id: string, isGraphqlRoot?: boolean) => void;
    goToSource?: (node: Type) => void
    onNodeDelete?: (typeId: string) => void;
    verifyTypeDelete?: (typeId: string) => Promise<boolean>;
    /** The service's request context; absent when it has none. */
    requestContext?: RequestContextSummary;
    /** Opens the request context editor; the root node offers it when given. */
    onOpenRequestContext?: () => void;
    /** Opens the service's full configuration; the root node offers it when given. */
    onOpenServiceConfig?: () => void;
}

const defaultState: any = {};
export const DiagramContext = createContext<IDiagramContext>(defaultState);

export function DesignDiagramContext(props: DiagramContextProps) {
    const {
        children,
        hasDiagnostics,
        focusedNodeId,
        readonly,
        setFocusedNodeId,
        selectedNodeId,
        setSelectedNodeId,
        onEditNode,
        goToSource,
        onNodeDelete,
        verifyTypeDelete,
        requestContext,
        onOpenRequestContext,
        onOpenServiceConfig
    } = props;

    let context: IDiagramContext = {
        hasDiagnostics,
        focusedNodeId,
        readonly,
        setFocusedNodeId,
        selectedNodeId,
        setSelectedNodeId,
        onEditNode,
        goToSource,
        onNodeDelete,
        verifyTypeDelete,
        requestContext,
        onOpenRequestContext,
        onOpenServiceConfig
    }

    return (
        <DiagramContext.Provider value={{ ...context }}>
            {children}
        </DiagramContext.Provider>
    );
}

export const useDiagramContext = () => React.useContext(DiagramContext);
