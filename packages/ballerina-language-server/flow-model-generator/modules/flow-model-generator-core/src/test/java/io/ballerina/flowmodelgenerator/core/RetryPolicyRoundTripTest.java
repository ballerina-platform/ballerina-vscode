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
        Assert.assertEquals(form.title(), "He said \"hi\"", "the escapes belong to the source, not the value");
        Assert.assertEquals(form.description(), "path C:\\x\nnext");

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
        Assert.assertEquals(review.review().title(), "Approve, please");
        Assert.assertEquals(rewrite(review.review()),
                "{userRoles: [\"finance\", \"manager\"], title: \"Approve, please\"}");

        CodeAnalyzer.RetryPolicyForm auto = CodeAnalyzer.normalizeRetryPolicy("{maxRetries: 3, retryDelay: 1.0}");
        Assert.assertEquals(auto.dropdownValue(), ActivityCallBuilder.AUTO_RETRY_VALUE);
        Assert.assertEquals(auto.maxRetries(), "3");
        Assert.assertEquals(auto.review().title(), "");
    }

    @Test(description = "A title that is not a string literal is the form's own source and passes through "
            + "unquoted on the way back")
    public void testExpressionTitlePassesThrough() {
        ActivityCallBuilder.ReviewFormValues form = CodeAnalyzer.normalizeRetryPolicy(
                "{userRoles: \"ops\", title: string `Order ${id}`}").review();
        Assert.assertEquals(form.title(), "string `Order ${id}`");
        Assert.assertEquals(rewrite(form), "{userRoles: \"ops\", title: string `Order ${id}`}");
    }

    // The record the form writes from the values it holds — the save side of the same node.
    private static String rewrite(ActivityCallBuilder.ReviewFormValues form) {
        Map<String, Property> properties = new LinkedHashMap<>();
        properties.put(ActivityCallBuilder.RETRY_USER_ROLES_KEY, property(form.userRoles()));
        properties.put(ActivityCallBuilder.RETRY_TITLE_KEY, property(form.title()));
        properties.put(ActivityCallBuilder.RETRY_DESCRIPTION_KEY, property(form.description()));
        properties.put(ActivityCallBuilder.RETRY_TIMEOUT_KEY, property(form.timeout()));
        return ActivityCallBuilder.humanReviewRecordLiteral(properties);
    }

    private static Property property(String value) {
        return new Property.Builder<Void>(null).value(value).build();
    }
}
