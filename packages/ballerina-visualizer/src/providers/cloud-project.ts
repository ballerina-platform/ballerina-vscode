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

import type { PlatformExtState } from "@wso2/ballerina-core/lib/rpc-types/platform-ext/interfaces";


/**
 * Whether the workspace is linked to a WSO2 Cloud project of the signed-in organization, which cloud
 * connections need. Judged by the project's name: the project's details are filled in only once
 * WSO2 Integrator has listed the organization's projects.
 */
export function hasCloudProject(state?: PlatformExtState): boolean {
    const context = state?.selectedContext;
    return !!state?.isLoggedIn && !!context?.projectName && !context.foreignOrg && !context.local;
}
