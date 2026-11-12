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

/**
 * Lets only the latest of a series of overlapping requests publish its result. Each request takes a token when it
 * starts and checks it before publishing: a request that started earlier, or one invalidated since (the field it was
 * for has closed), finds its token stale and drops its result.
 */
export interface RequestGate {
    begin(): number;
    isCurrent(token: number): boolean;
    invalidate(): void;
}

export function createRequestGate(): RequestGate {
    let latest = 0;
    return {
        begin: () => ++latest,
        isCurrent: (token: number) => token === latest,
        invalidate: () => {
            latest++;
        },
    };
}
