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
    /** Whether the GraphQL service has a request context, which its root node then indicates. */
    hasRequestContext?: boolean;
    /** Opens the request context editor; the root node offers it when given. */
    onOpenRequestContext?: () => void;
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
    /** Whether the GraphQL service has a request context, which its root node then indicates. */
    hasRequestContext?: boolean;
    /** Opens the request context editor; the root node offers it when given. */
    onOpenRequestContext?: () => void;
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
        hasRequestContext,
        onOpenRequestContext
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
        hasRequestContext,
        onOpenRequestContext
    }

    return (
        <DiagramContext.Provider value={{ ...context }}>
            {children}
        </DiagramContext.Provider>
    );
}

export const useDiagramContext = () => React.useContext(DiagramContext);
