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

import { useEffect, useState } from "react";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { RelativeLoader } from "../../../../components/RelativeLoader";
import { FunctionForm } from "../../FunctionForm";
import { FormContainer, LoaderWrapper } from "./styles";

// Durable agent declarations live beside the workflow artifacts, the same target as Integrator's own form.
const WORKFLOW_FILE_NAME = "workflows.bal";

export function CreateDurableAgentView({ projectPath }: { projectPath: string }) {
    const { rpcClient } = useRpcContext();
    const [filePath, setFilePath] = useState<string>();

    useEffect(() => {
        let cancelled = false;
        rpcClient
            .getVisualizerRpcClient()
            .joinProjectPath({ segments: [WORKFLOW_FILE_NAME] })
            .then((result) => {
                if (!cancelled) {
                    setFilePath(result.filePath);
                }
            });
        return () => {
            cancelled = true;
        };
    }, [rpcClient]);

    if (!filePath) {
        return (
            <LoaderWrapper>
                <RelativeLoader />
            </LoaderWrapper>
        );
    }

    return (
        <FormContainer>
            <FunctionForm
                projectPath={projectPath}
                filePath={filePath}
                functionName={undefined}
                isDurableAgent={true}
                embedded={true}
            />
        </FormContainer>
    );
}
