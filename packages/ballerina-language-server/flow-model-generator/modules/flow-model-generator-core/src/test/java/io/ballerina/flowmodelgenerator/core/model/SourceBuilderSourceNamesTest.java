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

package io.ballerina.flowmodelgenerator.core.model;

import org.testng.Assert;
import org.testng.annotations.Test;

import java.util.List;
import java.util.Map;

/**
 * Tests that the source builder writes the names nested in a node's properties (e.g. function parameters) in source
 * form without changing the node it was given.
 *
 * @since 1.7.0
 */
public class SourceBuilderSourceNamesTest {

    private static final String PARAMETERS = "parameters";

    @Test(description = "A nested name is written in source form on a copy; the given node, whose maps are "
            + "immutable here, is left as it was")
    public void testNestedNameIsEscapedOnACopy() {
        Map<String, Object> parameter = nameProperty("issue-number");
        Map<String, Object> parameters = Map.of("p1", parameter, "p2", nameProperty("count"));
        FlowNode flowNode = nodeWith(parameters);

        SourceBuilder sourceBuilder = new SourceBuilder(flowNode, null, null);

        Map<?, ?> written = (Map<?, ?>) sourceBuilder.flowNode.properties().get(PARAMETERS).value();
        Assert.assertEquals(((Map<?, ?>) written.get("p1")).get("value"), "issue\\-number");
        Assert.assertSame(written.get("p2"), parameters.get("p2"), "an unchanged name is not copied");
        Assert.assertEquals(parameter.get("value"), "issue-number");
        Assert.assertSame(flowNode.properties().get(PARAMETERS).value(), parameters);
    }

    @Test(description = "A node whose names are already in source form is used as it is")
    public void testUnchangedNodeIsNotCopied() {
        FlowNode flowNode = nodeWith(Map.of("p1", nameProperty("issue\\-number")));

        Assert.assertSame(new SourceBuilder(flowNode, null, null).flowNode, flowNode);
    }

    private static Map<String, Object> nameProperty(String name) {
        return Map.of("value", name, "editable", true,
                "types", List.of(Map.of("fieldType", Property.ValueType.IDENTIFIER.name(), "selected", true)));
    }

    private static FlowNode nodeWith(Map<String, Object> parameters) {
        Property property = new Property.Builder<>(null).value(parameters).build();
        return new FlowNode("node", null, null, false, List.of(), Map.of(PARAMETERS, property), null, 0);
    }
}
