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
import { Type, TypeFunctionModel } from '@wso2/ballerina-core';

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
    onFunctionOpen?: (node: Type, func: TypeFunctionModel) => void;
    onNodeDelete?: (typeId: string) => void;
    verifyTypeDelete?: (typeId: string) => Promise<boolean>;
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
    /** Opens a class method's implementation; the method names of a class are links only when set. */
    onFunctionOpen?: (node: Type, func: TypeFunctionModel) => void;
    onNodeDelete?: (typeId: string) => void;
    verifyTypeDelete?: (typeId: string) => Promise<boolean>;
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
        onFunctionOpen,
        onNodeDelete,
        verifyTypeDelete
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
        onFunctionOpen,
        onNodeDelete,
        verifyTypeDelete
    }

    return (
        <DiagramContext.Provider value={{ ...context }}>
            {children}
        </DiagramContext.Provider>
    );
}

export const useDiagramContext = () => React.useContext(DiagramContext);
