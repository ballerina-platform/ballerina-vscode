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

export const IDLE_LABEL = "Generating";
export const MIN_LABEL_VISIBLE_MS = 700;
export const LABEL_GRACE_MS = 300;

/**
 * How long to wait before showing `next` (0 = now). A step shows only if it is still running after the
 * grace, so one that finishes in milliseconds never flashes up after it is done; going idle shows at once.
 */
export function labelWaitMs(next: string, msSinceShown: number, idle = IDLE_LABEL): number {
    if (next === idle) return 0;
    return Math.max(LABEL_GRACE_MS, MIN_LABEL_VISIBLE_MS - msSinceShown);
}
