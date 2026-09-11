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

// The unsubscribe handed out by ArtifactNotificationHandler closes over the subscriber Set and
// drops the whole notification entry once that Set is empty, so releasing a wait twice would
// delete a Set that belongs to whoever subscribed in between.

import {
    ArtifactNotificationHandler,
    ArtifactsUpdated,
    startArtifactUpdateWait,
} from "../utils/project-artifacts-handler";

function publish(): void {
    ArtifactNotificationHandler.getInstance().publish(ArtifactsUpdated.method, {
        data: [] as never,
        timestamp: Date.now(),
    });
}

describe("artifact update wait", () => {
    beforeEach(() => {
        const handler = ArtifactNotificationHandler.getInstance() as unknown as { subscribers: Map<string, unknown> };
        handler.subscribers.clear();
    });

    it("leaves later subscribers alone when a settled wait is cancelled", async () => {
        const wait = startArtifactUpdateWait(() => { /* not the point of this test */ });
        publish();
        await expect(wait.notified).resolves.toBe(true);

        // Something else starts listening in the window before the restore unwinds.
        const laterListener = jest.fn();
        ArtifactNotificationHandler.getInstance().subscribe(ArtifactsUpdated.method, undefined, laterListener);

        // A restore that fails after the notification arrived cancels its already-settled wait.
        wait.cancel();
        publish();

        expect(laterListener).toHaveBeenCalledTimes(1);
    });

    it("stops listening once cancelled before any notification", async () => {
        const onArtifacts = jest.fn();
        const wait = startArtifactUpdateWait(onArtifacts);

        wait.cancel();
        publish();

        await expect(wait.notified).resolves.toBe(false);
        expect(onArtifacts).not.toHaveBeenCalled();
    });
});
