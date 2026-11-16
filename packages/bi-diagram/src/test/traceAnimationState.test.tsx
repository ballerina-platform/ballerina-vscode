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

import { renderHook } from "@testing-library/react";
import { TraceAnimationEvent } from "@wso2/ballerina-core";
import { setTraceAnimationActive, setTraceAnimationInactive, useTraceAnimation } from "../components/DiagramContext";

const tutor = "# Role  \nMath Tutor  \n\n# Instructions  \nTeach maths.";

function toolCall(toolCallId: string, traceId = "trace-1"): TraceAnimationEvent {
    return { type: "execute_tool", toolNames: ["sumTool"], activeToolName: "sumTool", toolCallId, traceId,
        spanId: toolCallId, active: true, systemInstructions: tutor };
}

const phases = () => renderHook(() => useTraceAnimation()).result.current?.entries
    .filter(e => e.type === "execute_tool")
    .map(e => `${e.toolCallId}:${e.traceId}:${e.phase}`);

describe("trace animation state", () => {
    it("keeps a parallel call of the same tool lit when the other one ends", () => {
        setTraceAnimationActive(toolCall("call-a"));
        setTraceAnimationActive(toolCall("call-b"));
        setTraceAnimationInactive({ ...toolCall("call-a"), active: false });
        expect(phases()).toEqual(["call-a:trace-1:fading-out", "call-b:trace-1:active"]);
    });

    it("keeps another run of the same agent lit when one run's call ends", () => {
        setTraceAnimationActive(toolCall("call-c", "trace-2"));
        setTraceAnimationActive(toolCall("call-c", "trace-3"));
        setTraceAnimationInactive({ ...toolCall("call-c", "trace-2"), active: false });
        expect(phases()).toContain("call-c:trace-3:active");
        expect(phases()).toContain("call-c:trace-2:fading-out");
    });
});
