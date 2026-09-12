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

package io.ballerina.flowmodelgenerator.core.model.node;

import io.ballerina.flowmodelgenerator.core.model.Property;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Tests for the Human Review record {@link ActivityCallBuilder} writes from the retry form.
 * <p>
 * The record is what the form holds and nothing more: an omitted title is not an empty one (the
 * runtime derives it), a plain title becomes a string literal with its contents escaped, and a value
 * already written as source is passed through.
 *
 * @since 1.7.0
 */
public class HumanReviewLiteralTest {

    @Test(description = "An empty form writes only the required roles, as the empty 'any role' list")
    public void testEmptyReview() {
        Assert.assertEquals(ActivityCallBuilder.humanReviewRecordLiteral(Map.of()), "{userRoles: []}");
        Assert.assertEquals(ActivityCallBuilder.humanReviewRecordLiteral(props(
                ActivityCallBuilder.RETRY_USER_ROLES_KEY, "",
                ActivityCallBuilder.RETRY_TITLE_KEY, "",
                ActivityCallBuilder.RETRY_TIMEOUT_KEY, "")), "{userRoles: []}");
    }

    @Test(description = "Roles alone: a bare role is quoted, a role list is written as it was typed")
    public void testRolesOnly() {
        Assert.assertEquals(ActivityCallBuilder.humanReviewRecordLiteral(props(
                ActivityCallBuilder.RETRY_USER_ROLES_KEY, "manager")), "{userRoles: \"manager\"}");
        Assert.assertEquals(ActivityCallBuilder.humanReviewRecordLiteral(props(
                ActivityCallBuilder.RETRY_USER_ROLES_KEY, "[\"finance\", \"manager\"]")),
                "{userRoles: [\"finance\", \"manager\"]}");
    }

    @Test(description = "Every populated field is written, in the record's order, with a duration passed as source")
    public void testFullReview() {
        Assert.assertEquals(ActivityCallBuilder.humanReviewRecordLiteral(props(
                ActivityCallBuilder.RETRY_USER_ROLES_KEY, "manager",
                ActivityCallBuilder.RETRY_TITLE_KEY, "Approve retry",
                ActivityCallBuilder.RETRY_DESCRIPTION_KEY, "The charge failed twice",
                ActivityCallBuilder.RETRY_TIMEOUT_KEY, "{hours: 4}")),
                "{userRoles: \"manager\", title: \"Approve retry\", description: \"The charge failed twice\", "
                        + "timeout: {hours: 4}}");
    }

    @Test(description = "Plain text is encoded as a Ballerina string literal: quotes, backslashes and line breaks")
    public void testEscaping() {
        Assert.assertEquals(ActivityCallBuilder.humanReviewRecordLiteral(props(
                ActivityCallBuilder.RETRY_USER_ROLES_KEY, "ops",
                ActivityCallBuilder.RETRY_TITLE_KEY, "Say \"go\"",
                ActivityCallBuilder.RETRY_DESCRIPTION_KEY, "path C:\\x\nnext")),
                "{userRoles: \"ops\", title: \"Say \\\"go\\\"\", description: \"path C:\\\\x\\nnext\"}");
    }

    @Test(description = "A value already written as source — a string literal or a template — passes through")
    public void testSourceShapedValuesPassThrough() {
        Assert.assertEquals(ActivityCallBuilder.humanReviewRecordLiteral(props(
                ActivityCallBuilder.RETRY_USER_ROLES_KEY, "ops",
                ActivityCallBuilder.RETRY_TITLE_KEY, "\"Pre-quoted\"",
                ActivityCallBuilder.RETRY_DESCRIPTION_KEY, "string `Order ${id}`")),
                "{userRoles: \"ops\", title: \"Pre-quoted\", description: string `Order ${id}`}");
    }

    @Test(description = "Only the review's own fields are written: auto-retry tuning and unknown keys are ignored")
    public void testUnrelatedPropertiesIgnored() {
        Assert.assertEquals(ActivityCallBuilder.humanReviewRecordLiteral(props(
                ActivityCallBuilder.RETRY_USER_ROLES_KEY, "ops",
                ActivityCallBuilder.MAX_RETRIES_KEY, "3",
                ActivityCallBuilder.RETRY_DELAY_KEY, "1.0",
                "retryTaskName", "legacy")), "{userRoles: \"ops\"}");
    }

    private static Map<String, Property> props(String... keyValues) {
        Map<String, Property> properties = new LinkedHashMap<>();
        for (int i = 0; i < keyValues.length; i += 2) {
            properties.put(keyValues[i], new Property.Builder<Void>(null).value(keyValues[i + 1]).build());
        }
        return properties;
    }
}
