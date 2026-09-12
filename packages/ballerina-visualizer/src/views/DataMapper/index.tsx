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

import React from "react";

import { CodeData, LinePosition, NodePosition } from "@wso2/ballerina-core";
import { DataMapperErrorBoundary } from "@wso2/ballerina-data-mapper";

import { TopNavigationBar } from "../../components/TopNavigationBar";
import { DataMapperView } from "./DataMapperView";
import { useRpcContext } from "@wso2/ballerina-rpc-client";

export interface DataMapperProps {
    filePath: string;
    codedata: CodeData;
    name: string;
    projectPath?: string;
    position?: LinePosition;
    reusable?: boolean;
    onClose?: () => void;
}

export function DataMapper(props: DataMapperProps) {

    const {rpcClient} = useRpcContext();

    const goToSource = () => {
        const lineRange = props.codedata.lineRange;
        const position: NodePosition = {
            startLine: lineRange?.startLine.line,
            startColumn: lineRange?.startLine.offset,
            endLine: lineRange?.endLine.line,
            endColumn: lineRange?.endLine.offset,
        };
        rpcClient.getCommonRpcClient().goToSource({ position });
    };

    const onClose = props.onClose || (() => {
        rpcClient.getVisualizerRpcClient()?.goBack();
    });

    return (
        <>
            <TopNavigationBar projectPath={props.projectPath}/>
            <DataMapperErrorBoundary onClose={onClose} goToSource={goToSource} >
                <DataMapperView {...props} goToSource={goToSource} onClose={onClose} />
            </DataMapperErrorBoundary>
        </>
    );
};
