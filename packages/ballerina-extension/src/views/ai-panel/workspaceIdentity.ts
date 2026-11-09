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

import * as path from 'path';

/**
 * Resolve a stable workspace identity for persistence hashing.
 *
 * In the cloud editor, every project is checked out at the same filesystem path
 * inside its container, so hashing the path would collide across projects when
 * a container is reused. When the cloud-assigned project id is available via
 * `CLOUD_INITIAL_PROJECT_ID`, use it directly as the identity. Otherwise fall
 * back to the resolved path (local dev and any non-cloud environment).
 */
export function resolveWorkspaceIdentity(projectRootPath: string): string {
    return process.env.CLOUD_INITIAL_PROJECT_ID || path.resolve(projectRootPath);
}
