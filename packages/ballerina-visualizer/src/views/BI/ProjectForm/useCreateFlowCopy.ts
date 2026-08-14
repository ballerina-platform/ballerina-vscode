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

import { ProductMode } from "@wso2/ballerina-core";
import { useProductMode } from "../../../hooks/useProductMode";
import { CreateFlowCopy, getCreateFlowCopy } from "./copy";

/**
 * The Create/Add flow copy for the flavor this webview runs in. For the forms
 * federated into the Integrator webview the mode arrives as a prop instead —
 * there is no `rpcClient` there — so those call `getCreateFlowCopy` directly.
 */
export function useCreateFlowCopy(): CreateFlowCopy {
    return getCreateFlowCopy(useProductMode() === ProductMode.AGENT_BUILDER);
}
