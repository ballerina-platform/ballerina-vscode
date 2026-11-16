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

import { NoObjectGeneratedError } from "ai";
import { retryOnNoObject } from "../features/ai/utils/no-object-retry";

const noObject = () => new NoObjectGeneratedError({
    message: "No object generated: the model answered in text.",
    text: "Here are the libraries: ...",
    response: { id: "msg", timestamp: new Date(0), modelId: "claude-sonnet-5-5" },
    usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } as any,
    finishReason: "stop",
});

describe("retryOnNoObject", () => {
    it("returns the first result without retrying", async () => {
        const call = jest.fn().mockResolvedValue({ libraries: ["ballerina/http"] });
        await expect(retryOnNoObject("test", call)).resolves.toEqual({ libraries: ["ballerina/http"] });
        expect(call).toHaveBeenCalledTimes(1);
    });

    it("retries once when the model answered without the object", async () => {
        const call = jest.fn().mockRejectedValueOnce(noObject()).mockResolvedValueOnce({ libraries: [] });
        await expect(retryOnNoObject("test", call)).resolves.toEqual({ libraries: [] });
        expect(call).toHaveBeenCalledTimes(2);
    });

    it("gives up after the retry fails too", async () => {
        const call = jest.fn().mockRejectedValue(noObject());
        await expect(retryOnNoObject("test", call)).rejects.toThrow("No object generated");
        expect(call).toHaveBeenCalledTimes(2);
    });

    it("does not retry other errors", async () => {
        const call = jest.fn().mockRejectedValue(new Error("network down"));
        await expect(retryOnNoObject("test", call)).rejects.toThrow("network down");
        expect(call).toHaveBeenCalledTimes(1);
    });
});
