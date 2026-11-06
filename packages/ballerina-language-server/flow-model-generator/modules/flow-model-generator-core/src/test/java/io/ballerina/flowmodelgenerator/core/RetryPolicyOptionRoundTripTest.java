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
import io.ballerina.flowmodelgenerator.core.model.node.FromExpressionOption;
import org.testng.Assert;
import org.testng.annotations.DataProvider;
import org.testng.annotations.Test;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Opening a retry policy in the form and saving it again without editing anything must leave the
 * source as it was. Runs the real reader against the real writer for every shape the policy takes,
 * which is the guarantee the whole From Expression option exists to provide: the form writes back
 * what it read, or it corrupts the program.
 *
 * @since 1.9.0
 */
public class RetryPolicyOptionRoundTripTest {

    @DataProvider(name = "policies")
    public Object[][] policies() {
        return new Object[][]{
                {"a module-level record reference", "STANDARD_RETRY"},
                {"a qualified reference", "policies.standard"},
                {"a call producing a policy", "retryPolicyFor(order)"},
                {"a reference whose name contains a sentinel word", "defaultNoRetryPolicy"},
                {"an automatic retry", "{maxRetries: 3, retryDelay: 1.0}"},
                {"an automatic retry tuned on one field", "{retryDelay: 5.0}"},
                {"a human review scoped to roles", "{userRoles: \"ops\"}"},
                {"a human review scoped to several roles", "{userRoles: [\"finance\", \"manager\"]}"},
                {"retries followed by a review", "{maxRetries: 2, userRoles: \"ops\"}"},
                {"a review carrying wording", "{userRoles: \"ops\", title: \"Approve, please\"}"},
                {"a review whose wording names a variable", "{userRoles: \"ops\", title: reviewTitle}"},
        };
    }

    @Test(dataProvider = "policies",
            description = "Reading a policy and writing it back unedited reproduces the source")
    public void testRoundTrip(String description, String source) {
        Assert.assertEquals(rewrite(source), source, description + " must survive an open and a save");
        // A second edit of the same node must not drift either.
        Assert.assertEquals(rewrite(rewrite(source)), source, description + " must be stable across edits");
    }

    @Test(description = "No retry is the default and is written as an absent argument, whichever spelling "
            + "the source used")
    public void testNoRetryIsNotWrittenOut() {
        for (String source : new String[]{"()", "NoRetry", "workflow:NoRetry", "workflow:NoAutomaticRetry"}) {
            Assert.assertNull(ActivityCallBuilder.retryPolicyEntryValue(propertiesFor(source)),
                    source + " is the default and is left out rather than written");
        }
    }

    // The form's properties as a node carries them after reading the source, and the policy the
    // writer produces from them: the open-and-save cycle of one node.
    private static String rewrite(String source) {
        return ActivityCallBuilder.retryPolicyEntryValue(propertiesFor(source));
    }

    private static Map<String, Property> propertiesFor(String source) {
        CodeAnalyzer.RetryPolicyForm form = CodeAnalyzer.normalizeRetryPolicy(source);
        Map<String, Property> properties = new LinkedHashMap<>();
        properties.put(ActivityCallBuilder.RETRY_POLICY_PARAM, property(form.dropdownValue()));
        properties.put(ActivityCallBuilder.RETRY_POLICY_EXPRESSION_KEY, property(form.expression()));
        properties.put(ActivityCallBuilder.MAX_RETRIES_KEY, property(form.maxRetries()));
        properties.put(ActivityCallBuilder.RETRY_DELAY_KEY, property(form.retryDelay()));
        properties.put(ActivityCallBuilder.RETRY_BACKOFF_KEY, property(form.retryBackoff()));
        properties.put(ActivityCallBuilder.MAX_RETRY_DELAY_KEY, property(form.maxRetryDelay()));
        properties.put(ActivityCallBuilder.RETRY_USER_ROLES_KEY, property(form.review().userRoles()));
        properties.put(ActivityCallBuilder.RETRY_USERS_KEY, property(form.review().users()));
        properties.put(ActivityCallBuilder.RETRY_TITLE_KEY, reviewText(form.review().title()));
        properties.put(ActivityCallBuilder.RETRY_DESCRIPTION_KEY, reviewText(form.review().description()));
        properties.put(ActivityCallBuilder.RETRY_TIMEOUT_KEY, property(form.review().timeout()));
        return properties;
    }

    private static Property property(String value) {
        return new Property.Builder<Void>(null).value(value).build();
    }

    /** A wording field as the node carries it: both modes, the one the read chose selected. */
    private static Property reviewText(ActivityCallBuilder.ReviewText text) {
        return new Property.Builder<Void>(null)
                .type().fieldType(Property.ValueType.TEXT).ballerinaType("string")
                    .selected(!text.expression()).stepOut()
                .type().fieldType(Property.ValueType.EXPRESSION).ballerinaType("string")
                    .selected(text.expression()).stepOut()
                .value(text.value())
                .build();
    }

    @Test(description = "The expression option refuses to save an empty field rather than writing the "
            + "policy away", expectedExceptions = UserFacingException.class)
    public void testEmptyExpressionRefused() {
        Map<String, Property> properties = new LinkedHashMap<>();
        properties.put(ActivityCallBuilder.RETRY_POLICY_PARAM, property(FromExpressionOption.VALUE));
        properties.put(ActivityCallBuilder.RETRY_POLICY_EXPRESSION_KEY, property("   "));
        ActivityCallBuilder.retryPolicyEntryValue(properties);
    }
}
