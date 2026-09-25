/*
 *  Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com)
 *
 *  WSO2 LLC. licenses this file to you under the Apache License,
 *  Version 2.0 (the "License"); you may not use this file except
 *  in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *  http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing,
 *  software distributed under the License is distributed on an
 *  "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 *  KIND, either express or implied.  See the License for the
 *  specific language governing permissions and limitations
 *  under the License.
 */

package io.ballerina.testmanagerservice.extension;

import io.ballerina.compiler.syntax.tree.FunctionDefinitionNode;
import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.compiler.syntax.tree.SyntaxTree;
import io.ballerina.tools.text.TextDocuments;
import org.eclipse.lsp4j.TextEdit;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.util.List;

/**
 * Tests for evaluation query serialization.
 *
 * @since 1.0.0
 */
public class UtilsTest {

    @Test
    public void testQueryExpressionRoundTrip() {
        List<String> queries = List.of("string `hello`", "string `Hello ${name}`", "\"legacy literal\"");
        ModulePartNode modulePartNode = parse(Utils.getQueriesDataProviderFunctionTemplate("loadQueriesData", queries));

        Assert.assertEquals(Utils.buildQueryExpressionArray(queries),
                "[string `hello`, string `Hello ${name}`, \"legacy literal\"]");
        Assert.assertEquals(Utils.extractQueryExpressionsFromDataProvider(modulePartNode, "loadQueriesData"), queries);
    }

    @Test
    public void testLegacyQueryProviderIsRewrittenAsMap() {
        ModulePartNode modulePartNode = parse("isolated function loadQueriesData() returns string[][]|error { "
                + "return [[string `hello`], [\"hi\"]]; }");
        List<String> queries = List.of("string `hello`", "\"bye\"");
        FunctionDefinitionNode provider = Utils.findFunctionByName(modulePartNode, "loadQueriesData").orElseThrow();

        Assert.assertEquals(Utils.extractQueryExpressionsFromDataProvider(modulePartNode, "loadQueriesData"),
                List.of("string `hello`", "\"hi\""));
        TextEdit edit = Utils.queriesProviderEdit(provider, queries).orElseThrow();
        Assert.assertEquals(edit.getNewText(),
                Utils.getQueriesDataProviderFunctionTemplate("loadQueriesData", queries).stripLeading());
        Assert.assertEquals(Utils.extractQueryExpressionsFromDataProvider(parse(edit.getNewText()), "loadQueriesData"),
                queries);
    }

    @Test
    public void testQueryExpressionsRejectNonStringExpressions() {
        Assert.expectThrows(IllegalArgumentException.class,
                () -> Utils.buildQueryExpressionArray(List.of("42")));
        Assert.expectThrows(IllegalArgumentException.class,
                () -> Utils.buildQueryExpressionArray(List.of("string `unterminated")));
    }

    private static ModulePartNode parse(String source) {
        return SyntaxTree.from(TextDocuments.from(source)).rootNode();
    }
}
