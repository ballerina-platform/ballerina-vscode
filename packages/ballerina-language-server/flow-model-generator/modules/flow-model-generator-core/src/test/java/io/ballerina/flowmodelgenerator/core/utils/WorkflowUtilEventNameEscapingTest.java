/*
 *  Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com) All Rights Reserved.
 *
 *  WSO2 LLC. licenses this file to you under the Apache License,
 *  Version 2.0 (the "License"); you may not use this file except
 *  in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *  http://www.apache.org/licenses/LICENSE-2.0
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

/**
 * A declared event channel's name makes a round trip: it is read out of the agent declaration's
 * string literal, and written back into a `sendData` call or a capability entry. The decode and the
 * encode have to be the same pair of escapes, or a name carrying a quote comes back as a different
 * channel and the send silently targets nothing.
 *
 * @since 1.8.0
 */
public class WorkflowUtilEventNameEscapingTest {

    @Test(description = "The escapes the writers produce are the ones the reader decodes")
    public void testRoundTripThroughConstantNameLiteral() {
        // A bare `"` is left out on purpose: quoteIfPlain documents an already-quoted value as
        // pass-through, and a lone quote satisfies both ends of that test, so it is returned as-is
        // rather than as a literal. That is its contract, not part of this pairing.
        for (String name : new String[] {"chat", "say\"hi", "back\\slash", "both\\\"kinds", "\\"}) {
            String literal = WorkflowUtil.constantNameLiteral(name);
            Assert.assertTrue(literal.startsWith("\"") && literal.endsWith("\""),
                    "expected a plain string literal for " + name + ", got " + literal);
            String body = literal.substring(1, literal.length() - 1);
            Assert.assertEquals(WorkflowUtil.unescapeLiteralBody(body), name,
                    "round trip changed the channel name via " + literal);
        }
    }

    @Test(description = "A declared name is decoded, so it is not escaped a second time on the way out")
    public void testDeclaredNameIsNotDoubleEscaped() {
        // What `{name: "say\"hi"}` looks like between its quotes in source.
        Assert.assertEquals(WorkflowUtil.unescapeLiteralBody("say\\\"hi"), "say\"hi");
        Assert.assertEquals(WorkflowUtil.unescapeLiteralBody("back\\\\slash"), "back\\slash");
    }

    @Test(description = "Only the two escapes the writers can reproduce are decoded")
    public void testOtherEscapesAreLeftAsWritten() {
        // Decoding these would put a real newline or tab in the value, and the writers escape only
        // `\` and `"` — so the literal they then produce would end early or carry a raw control
        // character. They stay as written instead.
        Assert.assertEquals(WorkflowUtil.unescapeLiteralBody("line\\nbreak"), "line\\nbreak");
        Assert.assertEquals(WorkflowUtil.unescapeLiteralBody("tab\\there"), "tab\\there");
        Assert.assertEquals(WorkflowUtil.unescapeLiteralBody("cr\\rhere"), "cr\\rhere");
        Assert.assertEquals(WorkflowUtil.unescapeLiteralBody("uni\\u{1F600}"), "uni\\u{1F600}");
    }

    @Test(description = "A name with nothing to decode is returned unchanged")
    public void testPlainNamesAreUntouched() {
        Assert.assertEquals(WorkflowUtil.unescapeLiteralBody(""), "");
        Assert.assertEquals(WorkflowUtil.unescapeLiteralBody("customerMessage"), "customerMessage");
    }

    @Test(description = "A trailing lone backslash is kept rather than dropped")
    public void testTrailingBackslashSurvives() {
        Assert.assertEquals(WorkflowUtil.unescapeLiteralBody("trailing\\"), "trailing\\");
    }
}
