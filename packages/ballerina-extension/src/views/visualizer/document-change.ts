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
 * Runs `save` and returns whether the view was ready when the change arrived, not when the
 * save finished.
 *
 * A change made while the machine is editing is the extension's own write (`updateSourceCode`).
 * On a slow file system the save can outlast that edit: the machine is back in `viewReady` by
 * the time it resolves, and reading the state then turns the extension's own write into a view
 * refresh — which pops an open `SKIP` form (e.g. Add Durable Workflow) off the history.
 */
export async function wasReadyBeforeSave(
    isReady: () => boolean,
    save?: () => PromiseLike<unknown>
): Promise<boolean> {
    const readyAtChange = isReady();
    if (save) {
        await save();
    }
    return readyAtChange;
}
