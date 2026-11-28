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

// `getIsValueCompatible` decides whether text mode may edit a value by stripping its outer quotes.
// Saying yes to something that is not one complete literal means text mode shows expression syntax
// as literal text and re-quotes it on save, silently rewriting the user's expression — so the
// interesting cases are the ones that only look like a single literal.

import { StringTemplateEditorConfig } from "../components/editors/MultiModeExpressionEditor/Configurations";

const isCompatible = (value: string) => new StringTemplateEditorConfig().getIsValueCompatible(value);

describe("StringTemplateEditorConfig.getIsValueCompatible", () => {
    it("accepts one complete string literal", () => {
        expect(isCompatible('"hello"')).toBe(true);
        expect(isCompatible('""')).toBe(true);
        // An escaped quote is content, not the end of the literal.
        expect(isCompatible('"say \\"hi\\""')).toBe(true);
        // An escaped backslash is content too, and does not escape the quote after it.
        expect(isCompatible('"a\\\\b"')).toBe(true);
    });

    it("accepts the string-template form it serializes to", () => {
        expect(isCompatible("string `hello`")).toBe(true);
    });

    it("rejects a concatenation that merely starts and ends with a quote", () => {
        expect(isCompatible('"Hello " + name + "!"')).toBe(false);
    });

    it("rejects a literal whose closing quote is escaped", () => {
        // The trailing `\"` escapes the final quote, so the literal never terminates. Skipping the
        // escaped character must not step over the closing quote and report a complete literal.
        expect(isCompatible('"abc\\"')).toBe(false);
        expect(isCompatible('"\\"')).toBe(false);
    });

    it("rejects a value that is not quoted at all", () => {
        expect(isCompatible("name")).toBe(false);
        expect(isCompatible('"unterminated')).toBe(false);
    });

    it("treats an empty value as compatible", () => {
        expect(isCompatible("")).toBe(true);
    });
});

describe("StringTemplateEditorConfig literal round trip", () => {
    const config = new StringTemplateEditorConfig();

    it("shows a saved string literal's text, not its escapes", () => {
        expect(config.serializeValue('"say \\"hi\\""')).toBe('say "hi"');
        expect(config.serializeValue('"path\\\\to"')).toBe("path\\to");
    });

    it("keeps the text when a literal becomes a template", () => {
        expect(config.deserializeValue('"say \\"hi\\""')).toBe('string `say "hi"`');
    });

    it("decodes a unicode escape instead of keeping its backslash", () => {
        expect(config.serializeValue('"smile \\u{1F600}"')).toBe("smile \u{1F600}");
        expect(config.deserializeValue('"smile \\u{1F600}"')).toBe("string `smile \u{1F600}`");
        expect(config.deserializeValue('"a\\tb\\nc"')).toBe("string `a\tb\nc`");
    });

    it("interpolates a backtick or ${ the template cannot hold as text", () => {
        expect(config.deserializeValue('"a`b"')).toBe('string `a${"`"}b`');
        expect(config.deserializeValue('"cost ${x}"')).toBe('string `cost ${"${"}x}`');
        expect(config.serializeValue('"a`b"')).toBe('a${"`"}b');
    });
});
