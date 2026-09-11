/*
 *  Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com)
 *
 *  WSO2 LLC. licenses this file to you under the Apache License,
 *  Version 2.0 (the "License"); you may not use this file except
 *  in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing,
 *  software distributed under the License is distributed on an
 *  "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 *  KIND, either express or implied.  See the License for the
 *  specific language governing permissions and limitations
 *  under the License.
 */

package io.ballerina.flowmodelgenerator.core.utils;

import org.testng.Assert;
import org.testng.annotations.Test;

import java.util.List;
import java.util.Map;

/**
 * Tests for the record-literal reader and string-literal writer in {@link WorkflowUtil}.
 * <p>
 * The reader feeds the retry-policy form from a {@code retryPolicy} record in source. A value that
 * contains a comma — a role list, a nested duration record, a title with punctuation — must come back
 * whole, or the form re-emits a truncated policy on save.
 *
 * @since 1.7.0
 */
public class WorkflowUtilLiteralTest {

    @Test(description = "A role list keeps both roles: the comma inside the list does not split the field")
    public void testParseRecordLiteralKeepsListValueWhole() {
        Map<String, String> fields = WorkflowUtil.parseRecordLiteral(
                "{userRoles: [\"finance\", \"manager\"], title: \"Approve\"}");
        Assert.assertEquals(fields.get("userRoles"), "[\"finance\", \"manager\"]");
        Assert.assertEquals(fields.get("title"), "\"Approve\"");
        Assert.assertEquals(fields.size(), 2);
    }

    @Test(description = "A nested record value stays one field, and fields keep their source order")
    public void testParseRecordLiteralKeepsNestedRecordWhole() {
        Map<String, String> fields = WorkflowUtil.parseRecordLiteral(
                "{userRoles: \"manager\", timeout: {hours: 4, minutes: 30}}");
        Assert.assertEquals(List.copyOf(fields.keySet()), List.of("userRoles", "timeout"));
        Assert.assertEquals(fields.get("timeout"), "{hours: 4, minutes: 30}");
    }

    @Test(description = "Commas, colons and escaped quotes inside a string literal belong to the string")
    public void testParseRecordLiteralRespectsStringLiterals() {
        Map<String, String> fields = WorkflowUtil.parseRecordLiteral(
                "{title: \"Approve, please: now\", description: \"He said \\\"go, now\\\"\"}");
        Assert.assertEquals(fields.get("title"), "\"Approve, please: now\"");
        Assert.assertEquals(fields.get("description"), "\"He said \\\"go, now\\\"\"");
    }

    @Test(description = "A string template value is kept whole, comma included")
    public void testParseRecordLiteralRespectsTemplates() {
        Map<String, String> fields = WorkflowUtil.parseRecordLiteral(
                "{title: string `Order ${id}, please`, userRoles: \"ops\"}");
        Assert.assertEquals(fields.get("title"), "string `Order ${id}, please`");
        Assert.assertEquals(fields.get("userRoles"), "\"ops\"");
    }

    @Test(description = "A quoted key is returned bare, and the AutoRetry record reads as before")
    public void testParseRecordLiteralAutoRetryAndQuotedKeys() {
        Assert.assertEquals(WorkflowUtil.parseRecordLiteral("{maxRetries: 3, retryDelay: 1.0}"),
                Map.of("maxRetries", "3", "retryDelay", "1.0"));
        Assert.assertEquals(WorkflowUtil.parseRecordLiteral("{\"max-retries\": 3}"),
                Map.of("max-retries", "3"));
    }

    @Test(description = "An empty record, and a literal without braces, both read cleanly")
    public void testParseRecordLiteralEdges() {
        Assert.assertTrue(WorkflowUtil.parseRecordLiteral("{}").isEmpty());
        Assert.assertTrue(WorkflowUtil.parseRecordLiteral("   ").isEmpty());
        Assert.assertEquals(WorkflowUtil.parseRecordLiteral("a: 1, b: [1, 2]"), Map.of("a", "1", "b", "[1, 2]"));
    }

    @Test(description = "A line comment above a field, or trailing one, is prose: its commas and colons do not "
            + "split anything and it never becomes part of a key")
    public void testParseRecordLiteralIgnoresLineComments() {
        Map<String, String> fields = WorkflowUtil.parseRecordLiteral("{\n"
                + "    // roles: finance, manager - see the policy\n"
                + "    userRoles: \"manager\", // was: [\"finance\", \"manager\"]\n"
                + "    timeout: {hours: 4} // a: b\n"
                + "}");
        Assert.assertEquals(List.copyOf(fields.keySet()), List.of("userRoles", "timeout"));
        Assert.assertEquals(fields.get("userRoles"), "\"manager\"");
        Assert.assertEquals(fields.get("timeout"), "{hours: 4}");
    }

    @Test(description = "A // inside a string or a template is content, and a comment on the last line with no "
            + "line break after it is still dropped")
    public void testStripLineCommentsKeepsStringsAndTemplates() {
        Assert.assertEquals(WorkflowUtil.stripLineComments("{title: \"http://x/a, b\", d: string `//t`} // c"),
                "{title: \"http://x/a, b\", d: string `//t`} ");
        Assert.assertEquals(WorkflowUtil.stripLineComments("a: \"say \\\"//\\\"\" // x\nb: 2"),
                "a: \"say \\\"//\\\"\" \nb: 2");
        Assert.assertEquals(WorkflowUtil.stripLineComments("no comment"), "no comment");
    }

    @Test(description = "Every character the literal syntax interprets is escaped, nothing else is touched")
    public void testStringLiteralEscapes() {
        Assert.assertEquals(WorkflowUtil.stringLiteral("plain"), "\"plain\"");
        Assert.assertEquals(WorkflowUtil.stringLiteral("say \"hi\""), "\"say \\\"hi\\\"\"");
        Assert.assertEquals(WorkflowUtil.stringLiteral("C:\\temp"), "\"C:\\\\temp\"");
        Assert.assertEquals(WorkflowUtil.stringLiteral("line1\nline2\tend\r"), "\"line1\\nline2\\tend\\r\"");
        Assert.assertEquals(WorkflowUtil.stringLiteral(""), "\"\"");
    }

    @Test(description = "A correlation name goes through the same encoder: an already-quoted name passes "
            + "through, and a line break in a free-form name cannot end the literal early")
    public void testEventNameLiteral() {
        Assert.assertEquals(WorkflowUtil.eventNameLiteral("chat"), "\"chat\"");
        Assert.assertEquals(WorkflowUtil.eventNameLiteral("  chat  "), "\"chat\"");
        Assert.assertEquals(WorkflowUtil.eventNameLiteral("\"chat\""), "\"chat\"");
        Assert.assertEquals(WorkflowUtil.eventNameLiteral("say \"hi\""), "\"say \\\"hi\\\"\"");
        Assert.assertEquals(WorkflowUtil.eventNameLiteral("line\nbreak"), "\"line\\nbreak\"");
        // A lone quote is not a pair, so it is encoded rather than taken for a literal.
        Assert.assertEquals(WorkflowUtil.eventNameLiteral("\""), "\"\\\"\"");
        Assert.assertEquals(WorkflowUtil.eventNameLiteral(null), "\"\"");
    }

    @Test(description = "The literal reader is the encoder's inverse: quotes and escapes are the source's, "
            + "not the value's")
    public void testStringLiteralTextDecodes() {
        Assert.assertEquals(WorkflowUtil.stringLiteralText("\"plain\""), "plain");
        Assert.assertEquals(WorkflowUtil.stringLiteralText("\"He said \\\"hi\\\"\""), "He said \"hi\"");
        Assert.assertEquals(WorkflowUtil.stringLiteralText("\"C:\\\\temp\""), "C:\\temp");
        Assert.assertEquals(WorkflowUtil.stringLiteralText("\"line1\\nline2\\tend\\r\""), "line1\nline2\tend\r");
        Assert.assertEquals(WorkflowUtil.stringLiteralText("\"grin \\u{1F600}\""), "grin \uD83D\uDE00");
        Assert.assertEquals(WorkflowUtil.stringLiteralText("\"\""), "");
        Assert.assertEquals(WorkflowUtil.stringLiteralText(null), "");
    }

    @Test(description = "What is not one string literal is the form's own source and passes through: an "
            + "expression, a template, a concatenation that merely begins and ends with a quote, and an "
            + "escape the syntax does not define")
    public void testStringLiteralTextLeavesSourceAlone() {
        Assert.assertEquals(WorkflowUtil.stringLiteralText("titleVar"), "titleVar");
        Assert.assertEquals(WorkflowUtil.stringLiteralText("string `Order ${id}`"), "string `Order ${id}`");
        Assert.assertEquals(WorkflowUtil.stringLiteralText("\"a\" + \"b\""), "\"a\" + \"b\"");
        Assert.assertEquals(WorkflowUtil.stringLiteralText("\"keep \\q\""), "keep \\q");
        Assert.assertEquals(WorkflowUtil.stringLiteralText("\"keep \\u{zz}\""), "keep \\u{zz}");
        Assert.assertEquals(WorkflowUtil.stringLiteralText("\"trailing \\\""), "trailing \\");
    }

    @Test(description = "Reading a literal and writing it again reproduces the source: escapes do not "
            + "accumulate over repeated saves")
    public void testStringLiteralRoundTrip() {
        for (String literal : List.of("\"plain\"", "\"He said \\\"hi\\\"\"", "\"C:\\\\temp\"",
                "\"line1\\nline2\\tend\\r\"", "\"\"", "\"grin \\u{1F600}\"")) {
            String once = WorkflowUtil.stringLiteral(WorkflowUtil.stringLiteralText(literal));
            Assert.assertEquals(WorkflowUtil.stringLiteral(WorkflowUtil.stringLiteralText(once)), once,
                    "a second save must not change " + literal);
        }
        Assert.assertEquals(WorkflowUtil.stringLiteral(
                WorkflowUtil.stringLiteralText("\"He said \\\"hi\\\"\\nnow\"")), "\"He said \\\"hi\\\"\\nnow\"");
    }

    @Test(description = "quoteIfPlain leaves source-shaped values alone and encodes plain text fully")
    public void testQuoteIfPlain() {
        Assert.assertEquals(WorkflowUtil.quoteIfPlain("\"already\""), "\"already\"");
        Assert.assertEquals(WorkflowUtil.quoteIfPlain("[\"a\", \"b\"]"), "[\"a\", \"b\"]");
        Assert.assertEquals(WorkflowUtil.quoteIfPlain("string `t`"), "string `t`");
        Assert.assertEquals(WorkflowUtil.quoteIfPlain("tab\there"), "\"tab\\there\"");
    }
}
