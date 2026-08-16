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

import { createContext } from "react";

/**
 * Capabilities a form host can restrict for every form mounted beneath it.
 * Absent (no provider) means an unrestricted host.
 */
export interface FormHostCapabilities {
    /**
     * Whether the type helper may offer creating new types. Pre-project hosts
     * (the Add Integration wizard) disable this: the type editor has no
     * visualizer state machine to resolve a file from, and a type created in
     * the throwaway staging scaffold would not reach the generated integration.
     */
    typeCreation: boolean;
}

export const FormHostCapabilitiesContext = createContext<FormHostCapabilities | undefined>(undefined);
