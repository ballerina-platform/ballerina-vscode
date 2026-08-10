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

// Components read `useRpcContext` from the @wso2/ballerina-rpc-client barrel
// (ESM-compiled - jest cannot load it through the symlink), so a test that renders such a
// component mocks that barrel to delegate here, ensuring the component and the Provider
// share ONE context:
//
//   jest.mock("@wso2/ballerina-rpc-client", () => {
//       const h = require("../../test/rpcHarness");
//       return { __esModule: true, useRpcContext: h.useRpcContext, Context: h.TestRpcContext };
//   });
//
// Rendering is left to the test (react-dom/client + act) so this package needs no extra
// test-only dependency.

import React from "react";

export const TestRpcContext = React.createContext<any>({ rpcClient: null });
export const useRpcContext = () => React.useContext(TestRpcContext);
