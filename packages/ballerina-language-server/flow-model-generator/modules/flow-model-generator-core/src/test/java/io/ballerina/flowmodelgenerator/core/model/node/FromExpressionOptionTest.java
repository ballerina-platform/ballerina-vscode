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
import io.ballerina.flowmodelgenerator.core.model.node.builtin.RestActivityStrategy.MethodSelection;
import org.testng.Assert;
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
        Assert.assertEquals(MethodSelection.fromSource("\"post\""), new MethodSelection("POST", ""));
        Assert.assertEquals(MethodSelection.fromSource(null), MethodSelection.template());
        Assert.assertEquals(MethodSelection.fromSource("GET_METHOD"),
                new MethodSelection(FromExpressionOption.VALUE, "GET_METHOD"));
        Assert.assertEquals(MethodSelection.fromSource("\"OPTIONS\""),
                new MethodSelection(FromExpressionOption.VALUE, "\"OPTIONS\""),
                "a method the dropdown does not list is kept as typed rather than replaced");
    }

    private static Property property(String value) {
        return new Property.Builder<Void>(null).value(value).build();
    }
}
