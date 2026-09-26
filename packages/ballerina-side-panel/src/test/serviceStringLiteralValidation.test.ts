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

// A string-literal service attach point (e.g. `service "QueueName" on rabbitmqListener`) is a
// STRING_LITERAL field: only a double-quoted Ballerina string literal is valid there, never a
// constant or a base path.

import { parseServiceStringLiteral } from "../utils/path-validations";

const firstError = (input: string) => parseServiceStringLiteral(input).errors[0]?.message;

describe("parseServiceStringLiteral", () => {
    it.each([
        ['"QueueName"'],
        ['""'],
        ['"orders.q-1"'],
        ['"with space"'],
        ['"esc\\"aped"'],
        ['"tab\\tnewline\\n\\\\"'],
        ['"\\u{1F600}"'],
    ])("accepts %s", (input) => {
        const result = parseServiceStringLiteral(input);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    it("leaves an empty value to the required rule", () => {
        expect(parseServiceStringLiteral("").valid).toBe(true);
    });

    it.each([["QueueName"], ["QUEUE_NAME"], ["/orders"], ["'orders"]])(
        "rejects %s, which is not a quoted literal",
        (input) => {
            expect(firstError(input)).toBe("value must be enclosed in double quotes");
        }
    );

    it.each([['"'], ['"QueueName']])("rejects %s, which has no closing quote", (input) => {
        expect(firstError(input)).toBe("value must end with a double quote");
    });

    it("rejects an unescaped inner double quote", () => {
        expect(firstError('"a"b"')).toBe("double quotes inside the value must be escaped");
    });

    it("rejects a line break", () => {
        expect(firstError('"a\nb"')).toBe("value cannot span multiple lines");
    });

    it.each([
        ['"a\\qb"', 'invalid escape sequence "\\q"'],
        ['"\\u{}"', 'invalid escape sequence "\\u"'],
        // The trailing backslash would escape the closing quote.
        ['"a\\"', 'invalid escape sequence "\\"'],
    ])("rejects the invalid escape in %s", (input, expected) => {
        expect(firstError(input)).toBe(expected);
    });
});
