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

import {
    DEFAULT_MODEL_PROVIDER_EXPR,
    DEFAULT_MODEL_PROVIDER_LABEL,
    DEFAULT_MODEL_PROVIDER_VAR,
    getModelProviderDisplayName,
    withoutDuplicateDefaultProvider,
} from "../utils/ai-utils";

describe("getModelProviderDisplayName", () => {
    it.each([DEFAULT_MODEL_PROVIDER_EXPR, DEFAULT_MODEL_PROVIDER_VAR])("shows %s as the Choreo default", (name) => {
        expect(getModelProviderDisplayName(name)).toBe(DEFAULT_MODEL_PROVIDER_LABEL);
    });

    it.each(["openAiModel", "myWso2ModelProvider", undefined])("leaves %s as it is", (name) => {
        expect(getModelProviderDisplayName(name)).toBe(name);
    });
});

describe("withoutDuplicateDefaultProvider", () => {
    const items = [{ value: DEFAULT_MODEL_PROVIDER_EXPR }, { value: DEFAULT_MODEL_PROVIDER_VAR }, { value: "openAiModel" }];
    const values = (list: { value: string }[]) => list.map((item) => item.value);

    it("keeps the inline default, not the shared variable, when the value is not the variable", () => {
        expect(values(withoutDuplicateDefaultProvider(items, ""))).toEqual([DEFAULT_MODEL_PROVIDER_EXPR, "openAiModel"]);
        expect(values(withoutDuplicateDefaultProvider(items, DEFAULT_MODEL_PROVIDER_EXPR))).toEqual([DEFAULT_MODEL_PROVIDER_EXPR, "openAiModel"]);
    });

    it("keeps the shared variable when the value already points at it", () => {
        expect(values(withoutDuplicateDefaultProvider(items, DEFAULT_MODEL_PROVIDER_VAR))).toEqual([DEFAULT_MODEL_PROVIDER_VAR, "openAiModel"]);
    });

    it("leaves a list with only one of them as it is", () => {
        const single = [{ value: DEFAULT_MODEL_PROVIDER_VAR }, { value: "openAiModel" }];
        expect(withoutDuplicateDefaultProvider(single, "")).toBe(single);
    });
});
