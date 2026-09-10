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

package io.ballerina.flowmodelgenerator.core;

import io.ballerina.flowmodelgenerator.core.model.Property;
import io.ballerina.flowmodelgenerator.core.model.node.ActivityCallBuilder;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Tests the retry policy read in {@link CodeAnalyzer} against the record
 * {@link ActivityCallBuilder#humanReviewRecordLiteral} writes: source read into the form and written
 * back must be the source it came from. {@code HumanReviewLiteralTest} covers the writer alone, which
 * is why an escape accumulating on each save — the read left the encoder's escapes in the value, and
 * the next save escaped those — went unnoticed.
 *
 * @since 1.7.0
 */
public class RetryPolicyRoundTripTest {

    @Test(description = "A review whose title and description carry a quote, a backslash and a line break "
            + "reads as the text it means, and writing it reproduces the source")
    public void testReviewTextRoundTrips() {
        String source = "{userRoles: \"manager\", title: \"He said \\\"hi\\\"\", "
                + "description: \"path C:\\\\x\\nnext\", timeout: {hours: 4}}";

        ActivityCallBuilder.ReviewFormValues form = CodeAnalyzer.normalizeRetryPolicy(source).review();
        Assert.assertEquals(form.title().value(), "He said \"hi\"",
                "the escapes belong to the source, not the value");
        Assert.assertFalse(form.title().expression(), "a string literal reads as text, not as source");
        Assert.assertEquals(form.description().value(), "path C:\\x\nnext");

        Assert.assertEquals(rewrite(form), source);
        // A second edit of the same node must not change it either.
        Assert.assertEquals(rewrite(CodeAnalyzer.normalizeRetryPolicy(rewrite(form)).review()), source);
    }

    @Test(description = "The dropdown and the fields of every policy shape survive the read")
    public void testPolicyShapesRead() {
        CodeAnalyzer.RetryPolicyForm review = CodeAnalyzer.normalizeRetryPolicy(
                "{userRoles: [\"finance\", \"manager\"], title: \"Approve, please\"}");
        Assert.assertEquals(review.dropdownValue(), ActivityCallBuilder.MANUAL_RETRY_VALUE);
        Assert.assertEquals(review.review().userRoles(), "[\"finance\", \"manager\"]");
        Assert.assertEquals(review.review().title().value(), "Approve, please");
        Assert.assertEquals(rewrite(review.review()),
                "{userRoles: [\"finance\", \"manager\"], title: \"Approve, please\"}");

        CodeAnalyzer.RetryPolicyForm auto = CodeAnalyzer.normalizeRetryPolicy("{maxRetries: 3, retryDelay: 1.0}");
        Assert.assertEquals(auto.dropdownValue(), ActivityCallBuilder.AUTO_RETRY_VALUE);
        Assert.assertEquals(auto.maxRetries(), "3");
        Assert.assertEquals(auto.review().title().value(), "");
    }

    @Test(description = "A title that is not a string literal is the form's own source and passes through "
            + "unquoted on the way back")
    public void testExpressionTitlePassesThrough() {
        ActivityCallBuilder.ReviewFormValues form = CodeAnalyzer.normalizeRetryPolicy(
                "{userRoles: \"ops\", title: string `Order ${id}`}").review();
        Assert.assertEquals(form.title().value(), "string `Order ${id}`");
        Assert.assertTrue(form.title().expression(), "a template is the form's own source");
        Assert.assertEquals(rewrite(form), "{userRoles: \"ops\", title: string `Order ${id}`}");
    }

    @Test(description = "A title naming a variable or calling a function is a reference, not a wording: "
            + "it survives the save instead of becoming a string literal of its own spelling")
    public void testReferenceTitleIsNotQuoted() {
        for (String expression : new String[]{"reviewTitle", "titles.orderReview", "getTitle()",
                "\"Order \" + id"}) {
            String source = "{userRoles: \"ops\", title: " + expression + "}";
            ActivityCallBuilder.ReviewFormValues form = CodeAnalyzer.normalizeRetryPolicy(source).review();
            Assert.assertEquals(form.title().value(), expression, "read back as source");
            Assert.assertTrue(form.title().expression(), expression + " is not a string literal");
            Assert.assertEquals(rewrite(form), source, "quoting " + expression + " would rewrite it");
        }
    }

    @Test(description = "A wording typed into the text box is quoted, so it is still a title")
    public void testTypedTitleIsQuoted() {
        Map<String, Property> properties = new LinkedHashMap<>();
        properties.put(ActivityCallBuilder.RETRY_USER_ROLES_KEY, property("\"ops\""));
        properties.put(ActivityCallBuilder.RETRY_TITLE_KEY,
                reviewTextProperty("Approve the order", false));
        Assert.assertEquals(ActivityCallBuilder.humanReviewRecordLiteral(properties),
                "{userRoles: \"ops\", title: \"Approve the order\"}");
    }

    // The record the form writes from the values it holds — the save side of the same node.
    private static String rewrite(ActivityCallBuilder.ReviewFormValues form) {
        Map<String, Property> properties = new LinkedHashMap<>();
        properties.put(ActivityCallBuilder.RETRY_USER_ROLES_KEY, property(form.userRoles()));
        properties.put(ActivityCallBuilder.RETRY_TITLE_KEY, reviewTextProperty(form.title()));
        properties.put(ActivityCallBuilder.RETRY_DESCRIPTION_KEY, reviewTextProperty(form.description()));
        properties.put(ActivityCallBuilder.RETRY_TIMEOUT_KEY, property(form.timeout()));
        return ActivityCallBuilder.humanReviewRecordLiteral(properties);
    }

    private static Property property(String value) {
        return new Property.Builder<Void>(null).value(value).build();
    }

    private static Property reviewTextProperty(ActivityCallBuilder.ReviewText text) {
        return reviewTextProperty(text.value(), text.expression());
    }

    /** The title/description property as the node carries it: both modes, one of them selected. */
    private static Property reviewTextProperty(String value, boolean expression) {
        return new Property.Builder<Void>(null)
                .type().fieldType(Property.ValueType.TEXT).ballerinaType("string")
                    .selected(!expression).stepOut()
                .type().fieldType(Property.ValueType.EXPRESSION).ballerinaType("string")
                    .selected(expression).stepOut()
                .value(value)
                .build();
    }
}
