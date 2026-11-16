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

import { a2aHandlerSummary } from "../utils/a2aHandler";

describe("the handler block of an operation that does not run the agent", () => {
    it.each([
        "handleGetTask", "handleListTasks", "handleCancelTask", "handleSubscribeToTask",
        "handleCreateTaskPushNotificationConfig", "handleGetTaskPushNotificationConfig",
        "handleListTaskPushNotificationConfigs", "handleDeleteTaskPushNotificationConfig",
    ])("describes %s in one line", (method) => {
        expect(a2aHandlerSummary(method)).toMatch(/^[A-Z].+\.$/);
    });

    it("has no summary for the operations that run the agent, which open the execute flow", () => {
        expect(a2aHandlerSummary("handleSendMessage")).toBeUndefined();
        expect(a2aHandlerSummary("handleSendStreamingMessage")).toBeUndefined();
        expect(a2aHandlerSummary(undefined)).toBeUndefined();
    });
});
