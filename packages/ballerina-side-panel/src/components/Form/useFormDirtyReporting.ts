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

/**
 * Tells the extension whether the form has unsaved edits, so that navigating away asks first. The
 * form reports under an id of its own: a form opened inside another on the same file (the helper
 * pane's "+ New Variable") must neither clear the outer form's edits by reporting itself clean as it
 * opens, nor leave its own edits behind when it closes.
 */
export function useFormDirtyReporting(fileName: string | undefined, isDirty: boolean): void {
    const { rpcClient } = useRpcContext();
    const [formId] = useState(() => crypto.randomUUID());

    useEffect(() => {
        if (!fileName || !rpcClient) {
            return;
        }
        const report = (dirty: boolean) =>
            rpcClient.getBIDiagramRpcClient().formDirtyDidChange({ filePath: fileName, formId, isDirty: dirty });
        report(isDirty);
        // Edits the form takes with it as it closes, or moves to another file, are no longer unsaved.
        return isDirty ? () => report(false) : undefined;
    }, [isDirty, fileName, rpcClient, formId]);
}
