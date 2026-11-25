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

// Diagnostics for a field come back from the language server out of order: a request for an older
// value can answer after the one for the newest edit. Each request takes the next revision for its
// field, and only an answer whose revision is still the field's latest may be applied, so a
// superseded answer can neither show stale errors nor disable Save.
export function createDiagnosticsRevisions() {
    const latest = new Map<string, number>();
    return {
        next(key: string): number {
            const revision = (latest.get(key) ?? 0) + 1;
            latest.set(key, revision);
            return revision;
        },
        isCurrent(key: string, revision: number): boolean {
            return latest.get(key) === revision;
        },
    };
}
