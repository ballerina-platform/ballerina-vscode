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

package io.ballerina.modelgenerator.commons;

import io.ballerina.compiler.syntax.tree.AnnotationNode;
import io.ballerina.compiler.syntax.tree.ClassDefinitionNode;
import io.ballerina.compiler.syntax.tree.FunctionDefinitionNode;
import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.compiler.syntax.tree.SyntaxTree;
import io.ballerina.tools.text.TextDocuments;
import org.testng.Assert;
import org.testng.annotations.DataProvider;
import org.testng.annotations.Test;

/**
 * Tests for {@link AgentToolAnnotation}.
 *
 * @since 2.0.0
 */
public class AgentToolAnnotationTest {

    private static final String NO_AUTH = "{}";
    private static final String CLASS_TOOL = """
            isolated class Tools {
                @ai:AgentTool {
                    requiresApproval: sendApproval
                }
                isolated function send(string to) returns string {
                    return to;
                }
            }
            """;

    private static String unix(String source) {
        return source.replace(System.lineSeparator(), "\n");
    }

    @DataProvider(name = "creates")
    public Object[][] creates() {
        return new Object[][]{
                {null, null, "@ai:AgentTool"},
                {NO_AUTH, "", "@ai:AgentTool"},
                {"{\"scopes\": \"string `a`, string `b`\"}", "fnA",
                        "@ai:AgentTool {\n    auth: {\n        scopes: [string `a`, string `b`]\n    },\n"
                                + "    requiresApproval: fnA\n}"},
        };
    }

    @Test(dataProvider = "creates")
    public void testCreate(String auth, String requiresApproval, String expected) {
        Assert.assertEquals(unix(AgentToolAnnotation.create(auth, requiresApproval)), expected);
    }

    @DataProvider(name = "updates")
    public Object[][] updates() {
        return new Object[][]{
                // String-template scopes become an array, the approval gate stays
                {"@ai:AgentTool {\n    requiresApproval: sumApproval\n}",
                        "{\"scopes\": \"string `test`,\\n    string `test2`\"}", "sumApproval",
                        "@ai:AgentTool {\n    requiresApproval: sumApproval,\n    auth: {\n"
                                + "        scopes: [string `test`, string `test2`]\n    }\n}"},
                // A commented-out field is kept after an empty mapping; the real field is removed
                {"@ai:AgentTool {\n    // requiresApproval: true,\n    requiresApproval: sumApproval\n}",
                        NO_AUTH, "", "@ai:AgentTool {} // requiresApproval: true,"},
                // A commented-out field is kept; the real field is replaced
                {"@ai:AgentTool {\n    // requiresApproval: true,\n    requiresApproval: sumApproval\n}",
                        NO_AUTH, "otherApproval",
                        "@ai:AgentTool {\n    // requiresApproval: true,\n    requiresApproval: otherApproval\n}"},
                {"@ai:AgentTool {\n    requiresApproval: true\n}", NO_AUTH, "", "@ai:AgentTool"},
                {"@ai:AgentTool", NO_AUTH, "true", "@ai:AgentTool {\n    requiresApproval: true\n}"},
                // Other fields and annotations are kept, auth is replaced in place
                {"@ai:AgentTool {\n    name: \"add\",\n    auth: {\n        scopes: [\"old\"]\n    },\n"
                        + "    requiresApproval: true\n}\n@display {label: \"\", iconPath: \"x.png\"}",
                        "{\"clientId\": \"\\\"abc\\\"\", \"scopes\": \"[\\\"a\\\", \\\"b\\\"]\"}", "",
                        "@ai:AgentTool {\n    name: \"add\",\n    auth: {\n        clientId: \"abc\",\n"
                                + "        scopes: [\"a\", \"b\"]\n    }\n}\n"
                                + "@display {label: \"\", iconPath: \"x.png\"}"},
                // A comment after a kept field moves above it, so the added comma isn't commented out
                {"@ai:AgentTool {\n    name: \"add\" // tool name\n}", NO_AUTH, "true",
                        "@ai:AgentTool {\n    // tool name\n    name: \"add\",\n    requiresApproval: true\n}"},
                {"@display {label: \"x\"}", NO_AUTH, "true", "@display {label: \"x\"}"},
        };
    }

    @Test(dataProvider = "updates")
    public void testUpdate(String annotations, String auth, String requiresApproval, String expected) {
        Assert.assertEquals(unix(AgentToolAnnotation.update(annotations, auth, requiresApproval)), expected);
    }

    @Test
    public void testClassToolValue() {
        ModulePartNode root = (ModulePartNode) SyntaxTree.from(TextDocuments.from(CLASS_TOOL)).rootNode();
        ClassDefinitionNode tools = (ClassDefinitionNode) root.members().get(0);
        AnnotationNode annotation = ((FunctionDefinitionNode) tools.members().get(0)).metadata().orElseThrow()
                .annotations().get(0);

        Assert.assertEquals(unix(AgentToolAnnotation.value(annotation, "{\"scopes\": \"[\\\"mail\\\"]\"}",
                        "sendApproval")),
                "{\n        requiresApproval: sendApproval,\n        auth: {\n            scopes: [\"mail\"]\n"
                        + "        }\n    }");
        Assert.assertEquals(AgentToolAnnotation.value(annotation, NO_AUTH, null), "");
    }
}
