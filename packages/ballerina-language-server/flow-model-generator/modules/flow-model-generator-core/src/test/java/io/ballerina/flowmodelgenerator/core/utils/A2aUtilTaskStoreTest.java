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

import io.ballerina.compiler.syntax.tree.ClassDefinitionNode;
import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.compiler.syntax.tree.SyntaxTree;
import io.ballerina.modelgenerator.commons.A2aExecutorTypes;
import io.ballerina.tools.text.TextDocuments;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.util.Optional;

/**
 * With two agents attached to A2A in one package, both task stores are in scope; these cover how the store of the
 * executor being edited is found, and which classes count as A2A executors.
 *
 * @since 1.9.0
 */
public class A2aUtilTaskStoreTest {

    private static final String TWO_AGENTS = """
            import ballerina/a2a;

            final a2a:InMemoryTaskStore weatherA2aTaskStore = new;
            final a2a:InMemoryTaskStore sharedStore = new;

            isolated class TripPlannerA2aExecutor {
                *a2a:AgentExecutor;
            }

            isolated class WeatherA2aExecutor {
                *a2a:AgentExecutor;
            }

            isolated service on tripPlannerA2aListener {
                private final a2a:DefaultHandler handler = new (new TripPlannerA2aExecutor(), taskStore = sharedStore);
            }

            isolated service on weatherA2aListener {
                private final a2a:DefaultHandler handler = new (new WeatherA2aExecutor(),
                        taskStore = weatherA2aTaskStore);
            }
            """;

    private static ModulePartNode parse(String source) {
        return SyntaxTree.from(TextDocuments.from(source)).rootNode();
    }

    @Test
    public void testTheStoreIsTheOneTheExecutorsHandlerIsGiven() {
        ModulePartNode root = parse(TWO_AGENTS);
        Assert.assertEquals(A2aUtil.taskStoreOf(root, "TripPlannerA2aExecutor"), Optional.of("sharedStore"));
        Assert.assertEquals(A2aUtil.taskStoreOf(root, "WeatherA2aExecutor"), Optional.of("weatherA2aTaskStore"));
        Assert.assertEquals(A2aUtil.taskStoreOf(root, "OtherExecutor"), Optional.empty());
    }

    @Test
    public void testWithoutAHandlerInTheFileTheGeneratedStoreNameIsUsed() {
        Assert.assertEquals(A2aUtil.generatedTaskStoreOf("TripPlannerA2aExecutor"),
                Optional.of("tripPlannerA2aTaskStore"));
        Assert.assertEquals(A2aUtil.generatedTaskStoreOf("A2aExecutor"), Optional.empty());
        Assert.assertEquals(A2aUtil.generatedTaskStoreOf("MyExecutor"), Optional.empty());
    }

    @Test
    public void testOnlyTheA2aAgentExecutorTypeMakesAnExecutor() {
        ModulePartNode root = parse("""
                import ballerina/a2a;
                import acme/jobs;

                class A { *a2a:AgentExecutor; }
                class B { *MyAgentExecutor; }
                class C { *jobs:MyAgentExecutor; }
                class D { }
                """);
        boolean[] expected = {true, false, false, false};
        int i = 0;
        for (var member : root.members()) {
            if (member instanceof ClassDefinitionNode classNode) {
                Assert.assertEquals(A2aExecutorTypes.isAgentExecutor(null, classNode), expected[i++],
                        classNode.className().text());
            }
        }
        Assert.assertEquals(i, expected.length);
    }
}
