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

import io.ballerina.flowmodelgenerator.core.UserFacingException;
import io.ballerina.flowmodelgenerator.core.model.Property;
import io.ballerina.flowmodelgenerator.core.model.node.builtin.RestActivityStrategy.MethodSelection;
import org.testng.Assert;
import org.testng.annotations.DataProvider;
import org.testng.annotations.Test;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Tests the expression option of the approval-policy and REST-method dropdowns: a value the
 * dropdown cannot show is read under the option and written back as typed, and a literal typed
 * under it reopens as the option it names.
 *
 * @since 1.9.0
 */
public class FromExpressionOptionTest {

    @Test(description = "An approval policy held in a variable opens under the expression option and is "
            + "written back unchanged")
    public void testApprovalReferenceRoundTrips() {
        ApprovalPolicyForm.Form form = ApprovalPolicyForm.normalize("FINANCE_GATE");
        Assert.assertEquals(form.dropdownValue(), FromExpressionOption.VALUE);
        Assert.assertEquals(form.expression(), "FINANCE_GATE");

        Map<String, Property> properties = new LinkedHashMap<>();
        properties.put(ApprovalPolicyForm.KEY, property(form.dropdownValue()));
        properties.put(ApprovalPolicyForm.EXPRESSION_KEY, property(form.expression()));
        Assert.assertEquals(ApprovalPolicyForm.literal(properties), "FINANCE_GATE");
    }

    @Test(description = "A review record typed under the approval expression option reopens as Human Approval")
    public void testApprovalLiteralReopensAsForm() {
        Map<String, Property> properties = new LinkedHashMap<>();
        properties.put(ApprovalPolicyForm.KEY, property(FromExpressionOption.VALUE));
        properties.put(ApprovalPolicyForm.EXPRESSION_KEY, property("{userRoles: \"finance\"}"));
        ApprovalPolicyForm.Form reopened = ApprovalPolicyForm.normalize(ApprovalPolicyForm.literal(properties));
        Assert.assertEquals(reopened.dropdownValue(), ApprovalPolicyForm.HUMAN_APPROVAL_VALUE);
        Assert.assertEquals(reopened.review().userRoles(), "\"finance\"");
    }

    @Test(description = "The method dropdown reads a literal method as itself and anything else as an expression")
    public void testMethodSelection() {
        Assert.assertEquals(MethodSelection.fromSource("\"POST\""), new MethodSelection("POST", ""));
        Assert.assertEquals(MethodSelection.fromSource("\"post\""),
                new MethodSelection(FromExpressionOption.VALUE, "\"post\""),
                "`\"post\"` is not a RestMethod, so it is kept as typed rather than corrected to POST");
        Assert.assertEquals(MethodSelection.fromSource(null), MethodSelection.template());
        Assert.assertEquals(MethodSelection.fromSource("GET_METHOD"),
                new MethodSelection(FromExpressionOption.VALUE, "GET_METHOD"));
        Assert.assertEquals(MethodSelection.fromSource("\"OPTIONS\""),
                new MethodSelection(FromExpressionOption.VALUE, "\"OPTIONS\""),
                "a method the dropdown does not list is kept as typed rather than replaced");
    }

    @Test(dataProvider = "approvalPolicies",
            description = "Reading an approval policy and writing it back unedited reproduces the source")
    public void testApprovalRoundTrip(String description, String source) {
        ApprovalPolicyForm.Form form = ApprovalPolicyForm.normalize(source);
        Map<String, Property> properties = new LinkedHashMap<>();
        properties.put(ApprovalPolicyForm.KEY, property(form.dropdownValue()));
        properties.put(ApprovalPolicyForm.EXPRESSION_KEY, property(form.expression()));
        properties.put(ApprovalPolicyForm.USER_ROLES_KEY, property(form.review().userRoles()));
        properties.put(ApprovalPolicyForm.USERS_KEY, property(form.review().users()));
        Assert.assertEquals(ApprovalPolicyForm.literal(properties), source,
                description + " must survive an open and a save");
    }

    @DataProvider(name = "approvalPolicies")
    public Object[][] approvalPolicies() {
        return new Object[][]{
                {"a module-level record reference", "FINANCE_GATE"},
                {"a qualified reference", "gates.finance"},
                {"a call producing a policy", "gateFor(order)"},
                {"a review scoped to roles", "{userRoles: \"finance\"}"},
                {"a review scoped to several roles", "{userRoles: [\"finance\", \"manager\"]}"},
        };
    }

    @Test(description = "No approval is the default and is written as an absent argument, whichever "
            + "spelling the source used")
    public void testNoApprovalIsNotWrittenOut() {
        for (String source : new String[]{"()", "NoApproval", "workflow:NoApproval"}) {
            ApprovalPolicyForm.Form form = ApprovalPolicyForm.normalize(source);
            Map<String, Property> properties = new LinkedHashMap<>();
            properties.put(ApprovalPolicyForm.KEY, property(form.dropdownValue()));
            Assert.assertNull(ApprovalPolicyForm.literal(properties),
                    source + " is the default and is left out rather than written");
        }
    }

    @Test(description = "The approval expression option refuses an empty field rather than writing the "
            + "gate away", expectedExceptions = UserFacingException.class)
    public void testEmptyApprovalExpressionRefused() {
        Map<String, Property> properties = new LinkedHashMap<>();
        properties.put(ApprovalPolicyForm.KEY, property(FromExpressionOption.VALUE));
        properties.put(ApprovalPolicyForm.EXPRESSION_KEY, property("  "));
        ApprovalPolicyForm.literal(properties);
    }

    @Test(description = "A method written as a call, a template or with surrounding space is kept as "
            + "typed, since none of them is a literal naming one of the listed methods")
    public void testMethodExpressionForms() {
        Assert.assertEquals(MethodSelection.fromSource("  \"PUT\"  "), new MethodSelection("PUT", ""),
                "surrounding space does not stop a literal naming a listed method");
        Assert.assertEquals(MethodSelection.fromSource("methodFor(request)"),
                new MethodSelection(FromExpressionOption.VALUE, "methodFor(request)"));
        Assert.assertEquals(MethodSelection.fromSource("config.method"),
                new MethodSelection(FromExpressionOption.VALUE, "config.method"));
        Assert.assertEquals(MethodSelection.fromSource("   "), MethodSelection.template(),
                "a blank argument is the template default, not an empty expression");
    }

    @Test(description = "A method read as an expression reads back the same way, so reopening a node "
            + "does not move it to a different mode")
    public void testMethodSelectionIsStable() {
        for (String source : new String[]{"GET_METHOD", "\"POST\"", "\"OPTIONS\"", "\"post\"",
                "methodFor(request)"}) {
            MethodSelection first = MethodSelection.fromSource(source);
            String written = FromExpressionOption.isSelected(first.method())
                    ? first.expression() : "\"" + first.method() + "\"";
            Assert.assertEquals(MethodSelection.fromSource(written), first,
                    source + " must read back into the same selection");
        }
    }

    private static Property property(String value) {
        return new Property.Builder<Void>(null).value(value).build();
    }
}
