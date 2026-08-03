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
 * High-value follow-up actions a Ballerina developer commonly wants next.
 *
 * These are NOT rigid templates. They steer the model (hybrid strategy): when one of
 * these is relevant to the last exchange, the model is told to prefer it and phrase it
 * for the current context; otherwise it generates a contextual suggestion of its own.
 */
export interface AnchorAction {
    /** Short chip text, imperative (what the user sees). */
    label: string;
    /** When this action is worth suggesting — guidance for the model, not shown to the user. */
    description: string;
}

export const ANCHOR_ACTIONS: AnchorAction[] = [
    { label: "Add tests", description: "add tests that check the integration behaves as expected" },
    { label: "Try it out", description: "run the integration and see it working" },
    { label: "Handle errors", description: "handle failures, timeouts, and unexpected input gracefully" },
    { label: "Add authentication", description: "secure the service so only authorized callers can use it" },
    { label: "Add logging", description: "record activity so the integration can be monitored and debugged" },
    { label: "Validate input", description: "check incoming requests so bad data is rejected safely" },
    { label: "Explain how it works", description: "walk through what the integration does" },
    { label: "Add a connector", description: "connect to another system or service, such as a database, API, or SaaS app" },
];
