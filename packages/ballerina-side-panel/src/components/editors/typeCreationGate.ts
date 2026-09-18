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
 * The type editors offer creating a type through the completion list's default entry, which opens
 * the record editor. A host that forbids creating types passes no handler, and then the entry must
 * not be offered at all. Both editors ask through here so a fix to one cannot miss the other.
 *
 * @param showDefaultCompletion whether the editor would otherwise offer the entry
 * @param openRecordEditor the host's handler, absent when it forbids creating types
 * @return whether the entry may be offered
 */
export function canOfferTypeCreation(showDefaultCompletion: boolean, openRecordEditor: unknown): boolean {
    return showDefaultCompletion && typeof openRecordEditor === "function";
}
