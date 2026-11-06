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
 * @jest-environment node
 *
 * Pure module, so no DOM is needed.
 */

import { describeRestore, splitAtCheckpoint, toRestoredPromptText } from "./restoreUndo";

type Msg = { role: string; content: string; checkpointId?: string };

const transcript: Msg[] = [
    { role: "User", content: "first", checkpointId: "cp-1" },
    { role: "Copilot", content: "done 1" },
    { role: "User", content: "second", checkpointId: "cp-2" },
    { role: "Copilot", content: "done 2" },
    { role: "User", content: "third", checkpointId: "cp-3" },
    { role: "Copilot", content: "done 3" },
];

describe("splitAtCheckpoint", () => {
    it.each(["cp-1", "cp-2", "cp-3"])("splits so kept + removed is the transcript, removed starting at %s", (id) => {
        const { kept, removed } = splitAtCheckpoint(transcript, id);
        expect([...kept, ...removed]).toEqual(transcript);
        expect(removed[0].checkpointId).toBe(id);
        expect(kept.some((m) => m.checkpointId === id)).toBe(false);
    });

    it("removes nothing for a checkpoint the panel does not show", () => {
        expect(splitAtCheckpoint(transcript, "cp-missing")).toEqual({ kept: transcript, removed: [] });
    });
});

describe("toRestoredPromptText", () => {
    it("keeps plain prompts as they were", () => {
        expect(toRestoredPromptText("add a /health resource")).toBe("add a /health resource");
    });

    it("keeps a badge's visible text and drops its markup", () => {
        const stored = '<badge data-system="true" data-auth="x" data-type="command" data-command="/ask">/ask</badge> how do I log?';
        expect(toRestoredPromptText(stored)).toBe("/ask how do I log?");
    });

    it("drops attachment markers, whose files cannot be re-attached", () => {
        expect(toRestoredPromptText("use this schema<attachment>a.json</attachment><attachment>b.json</attachment>"))
            .toBe("use this schema");
    });
});

describe("describeRestore", () => {
    it("counts turns in the singular and plural", () => {
        expect(describeRestore(1)).toBe("Restored checkpoint · 1 turn removed");
        expect(describeRestore(3)).toBe("Restored checkpoint · 3 turns removed");
    });
});
