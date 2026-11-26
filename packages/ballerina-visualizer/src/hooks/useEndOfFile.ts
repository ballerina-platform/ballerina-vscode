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
import { LineRange } from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";

const FILE_START: LineRange = { startLine: { line: 0, offset: 0 }, endLine: { line: 0, offset: 0 } };

/** The end of a file, where a new item's values are checked: line 0 is above the file's imports. */
export function useEndOfFile(filePath?: string): LineRange {
    const { rpcClient } = useRpcContext();
    const [range, setRange] = useState<LineRange>(FILE_START);
    useEffect(() => {
        if (!filePath) {
            return;
        }
        let current = true;
        rpcClient.getBIDiagramRpcClient().getEndOfFile({ filePath })
            .then((end) => current && setRange({ startLine: end, endLine: end }))
            .catch((): void => undefined);
        return () => { current = false; };
    }, [rpcClient, filePath]);
    return range;
}
