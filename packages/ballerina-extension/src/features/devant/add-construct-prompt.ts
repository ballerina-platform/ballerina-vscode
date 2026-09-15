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

import { EVENT_TYPE, MACHINE_VIEW } from "@wso2/ballerina-core";
import { window } from "vscode";
import { openView } from "../../stateMachine";
import { log } from "../../utils/logger";

/**
 * Tells the user the package holds nothing deployable, and offers to open the construct view.
 * Shown by every deploy entry point that finds no scopes, so the wording stays in one place.
 *
 * Kept out of `integration-type.ts` deliberately: opening the view needs the state machine and
 * the ballerina-core barrel, and importing either there would make the resolution helper — and
 * so its unit tests — unloadable under jest.
 */
export function promptToAddConstruct(): void {
    // Deliberately not awaited: the caller has already given up on deploying and returns, rather
    // than hanging on the user dismissing a notification. Rejection is handled through `then`'s
    // second argument because `showInformationMessage` returns a Thenable, which has no `catch`.
    window
        .showInformationMessage(
            "Please add a construct and try again to deploy your integration",
            "Add Construct"
        )
        .then(
            (resp) => {
                if (resp === "Add Construct") {
                    openView(EVENT_TYPE.OPEN_VIEW, { view: MACHINE_VIEW.BIComponentView });
                }
            },
            (err) => log(`Failed to show the add-construct prompt: ${err}`),
        );
}
