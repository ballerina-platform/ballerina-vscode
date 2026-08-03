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

// Generic RPC render harness: render a webview view inside the REAL rpc `Context`
// with a caller-supplied `rpcClient`. Views read `useRpcContext().rpcClient` and call
// `rpcClient.getXxxRpcClient().method(...)`; pass a client whose methods delegate to a
// headless rpc-manager (or, for pass-through managers, straight to the L4 LS harness)
// to drive the view against live data — no captured fixtures, no VSCode.

import React, { ReactNode } from "react";
import { render } from "@testing-library/react";
// Import the context from source (not the ESM-compiled lib, which jest can't load via
// the node_modules symlink). ts-jest transforms this .ts; its only value import is React.
import { Context as RpcContext } from "../../../ballerina-rpc-client/src/context/ballerina-web-context";

/** Render `ui` with the given (usually partial/fake) rpcClient provided via the real context. */
export function renderWithRpc(ui: ReactNode, rpcClient: any) {
    return render(<RpcContext.Provider value={{ rpcClient }}>{ui}</RpcContext.Provider>);
}
