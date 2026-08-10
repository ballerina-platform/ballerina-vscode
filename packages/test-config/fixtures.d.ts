/**
 * Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
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

/** Load and parse a single JSON fixture. */
export function loadFixture<T = unknown>(dir: string, ...segments: string[]): T;

/** Load every *.json fixture in a directory (non-recursive), sorted by name. */
export function loadFixtures<T = unknown>(
    dir: string,
    ...segments: string[]
): Array<{ name: string; data: T }>;
