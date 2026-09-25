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

import { FormField } from "../components/Form/types";
import { CLIENT_VALIDATION_RULES } from "../components/Form/validationRules";

const field = {} as FormField;
const run = (rule: string, value: string) => CLIENT_VALIDATION_RULES[rule](value, {}, field, {});

describe.each(["common.validate.service.path", "vscode.validate.resource.path"])("%s", (rule) => {
    it.each(["/chat", "chat/rooms", "'function", "chat/'service"])("accepts %s", (path) => {
        expect(run(rule, path)).toBeUndefined();
    });

    it.each(["function", "chat/service", "/listener", "class", "a/foreach"])("rejects the bare reserved word in %s", (path) => {
        expect(run(rule, path)).toBeDefined();
    });
});
