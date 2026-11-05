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

import io.ballerina.compiler.syntax.tree.FunctionDefinitionNode;
import io.ballerina.compiler.syntax.tree.ModuleMemberDeclarationNode;
import io.ballerina.compiler.syntax.tree.NodeParser;
import org.testng.Assert;
import org.testng.annotations.DataProvider;
import org.testng.annotations.Test;

/**
 * Tests for the documentation lines {@link SourceBuilder.TokenBuilder} writes from form descriptions.
 * <p>
 * A form sends its text with "\n" line breaks on every OS, while the builder writes the OS's own; every
 * line of a description has to become a documentation line either way, or the rest of it is parsed as code.
 *
 * @since 1.7.0
 */
public class SourceBuilderDocCommentTest {

    private static final String LS = System.lineSeparator();

    @DataProvider(name = "lineBreaks")
    public Object[][] lineBreaks() {
        return new Object[][]{{"\n"}, {"\r\n"}};
    }

    @Test(dataProvider = "lineBreaks", description = "Every line of a description becomes a documentation line")
    public void testMultiLineDescription(String lineBreak) {
        Assert.assertEquals(raw(tokens().descriptionDoc("Delegates a query." + lineBreak + "Use it for orders.")),
                "# Delegates a query." + LS + "# Use it for orders." + LS);
    }

    @Test(dataProvider = "lineBreaks", description = "Parameter and return descriptions continue on doc lines")
    public void testMultiLineParameterAndReturn(String lineBreak) {
        Assert.assertEquals(raw(tokens()
                        .parameterDoc("query", "The request." + lineBreak + "Keep it short.")
                        .returnDoc("The response." + lineBreak + "Or an error.")),
                "# + query - The request." + LS + "# Keep it short." + LS
                        + "# + return - The response." + LS + "# Or an error." + LS);
    }

    @Test(dataProvider = "lineBreaks", description = "A description read back from source ends in a line break; it "
            + "adds no blank line")
    public void testTrailingLineBreakAddsNoBlankLine(String lineBreak) {
        Assert.assertEquals(raw(tokens()
                        .descriptionDoc("Delegates a query." + lineBreak)
                        .returnDoc("The response." + lineBreak)),
                "# Delegates a query." + LS + "# + return - The response." + LS);
    }

    @Test(dataProvider = "lineBreaks", description = "A blank line inside a description stays a paragraph break")
    public void testParagraphBreakIsKept(String lineBreak) {
        Assert.assertEquals(raw(tokens().descriptionDoc("First." + lineBreak + lineBreak + "Second.")),
                "# First." + LS + "# " + LS + "# Second." + LS);
    }

    @Test(dataProvider = "lineBreaks", description = "A function with a multi-line description still parses as one "
            + "function under its own name")
    public void testDocumentedFunctionParses(String lineBreak) {
        String source = tokens()
                .descriptionDoc("Delegates a query to aiAgent." + lineBreak + "Use it for order questions." + lineBreak)
                .parameterDoc("query", "The request to send.")
                .name("isolated function probeAgentTool(string query) returns string {" + LS
                        + "return query;" + LS + "}")
                .build(SourceBuilder.SourceKind.DECLARATION);

        ModuleMemberDeclarationNode node = NodeParser.parseModuleMemberDeclaration(source);
        Assert.assertFalse(node.hasDiagnostics(), source);
        Assert.assertTrue(node instanceof FunctionDefinitionNode, source);
        Assert.assertEquals(((FunctionDefinitionNode) node).functionName().text(), "probeAgentTool");
        Assert.assertTrue(source.contains("# Use it for order questions."), source);
    }

    private static SourceBuilder.TokenBuilder tokens() {
        return new SourceBuilder.TokenBuilder(null);
    }

    private static String raw(SourceBuilder.TokenBuilder tokens) {
        return tokens.skipFormatting().build(SourceBuilder.SourceKind.DECLARATION);
    }
}
