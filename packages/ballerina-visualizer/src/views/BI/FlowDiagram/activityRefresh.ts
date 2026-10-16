/**
 * Copyright (c) 2026, WSO2 LLC. (http://www.wso2.org)
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

import { Category } from "@wso2/ballerina-core";

export interface ActivityListPoll {
    search: () => Promise<Category[]>;
    // True once a later user action owns the panel; the poll then stops without another search.
    superseded: () => boolean;
    sleep: (ms: number) => Promise<void>;
    // The activity just written; without it any activity at all counts.
    recentIdentifier?: string;
    attempts?: number;
    delayMs?: number;
}

export const listsActivity = (categories: Category[] | undefined, recentIdentifier?: string): boolean => {
    const raw = JSON.stringify(categories ?? []);
    if (recentIdentifier) {
        return raw.includes(`"${recentIdentifier}"`);
    }
    return raw.includes('"node":"ACTIVITY_CALL"') || raw.includes("DURABLE_AGENT_ADD_ACTIVITY");
};

// Searches the activity list after a write until the new activity is compiled into it (compiles run to
// seconds on ai/mcp projects), or the attempts run out, or the user moves on. Returns the last response.
export async function pollActivityList(poll: ActivityListPoll): Promise<Category[]> {
    const attempts = poll.attempts ?? 4;
    const delayMs = poll.delayMs ?? 1500;
    let categories = await poll.search();
    for (let attempt = 0; attempt < attempts && !listsActivity(categories, poll.recentIdentifier) && !poll.superseded(); attempt++) {
        await poll.sleep(delayMs);
        if (poll.superseded()) {
            break;
        }
        categories = await poll.search();
    }
    return categories;
}
