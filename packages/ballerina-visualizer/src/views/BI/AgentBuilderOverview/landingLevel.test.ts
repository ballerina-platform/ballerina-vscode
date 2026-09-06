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

import { landingLevel } from "./landingLevel";

describe("landingLevel", () => {
    it("forces the agent page with no agents (moot -- EmptyState wins)", () => {
        expect(landingLevel(0, undefined)).toBe("agent");
        expect(landingLevel(0, "overview")).toBe("agent");
        expect(landingLevel(0, "agent")).toBe("agent");
    });

    it("forces the agent page with exactly one agent, regardless of what was remembered", () => {
        expect(landingLevel(1, undefined)).toBe("agent");
        expect(landingLevel(1, "overview")).toBe("agent");
        expect(landingLevel(1, "agent")).toBe("agent");
    });

    it("lands on the overview with ≥2 agents on a fresh open (nothing remembered)", () => {
        expect(landingLevel(2, undefined)).toBe("overview");
        expect(landingLevel(5, undefined)).toBe("overview");
    });

    it("restores whichever level was remembered with ≥2 agents", () => {
        expect(landingLevel(2, "overview")).toBe("overview");
        expect(landingLevel(2, "agent")).toBe("agent");
        expect(landingLevel(5, "agent")).toBe("agent");
    });
});
