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

import com.google.gson.JsonObject;
import io.ballerina.compiler.syntax.tree.FunctionDefinitionNode;
import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.compiler.syntax.tree.SyntaxTree;
import io.ballerina.tools.text.TextDocuments;
import org.eclipse.lsp4j.Position;
import org.eclipse.lsp4j.Range;
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
        String source = "isolated function loadQueriesData() returns string[][]|error { "
                + "return [[string `hello`], [\"hi\"]]; }";
        ModulePartNode modulePartNode = parse(source);
        List<String> queries = List.of("string `hello`", "\"bye\"");
        FunctionDefinitionNode provider = Utils.findFunctionByName(modulePartNode, "loadQueriesData").orElseThrow();

        Assert.assertEquals(Utils.extractQueryExpressionsFromDataProvider(modulePartNode, "loadQueriesData"),
                List.of("string `hello`", "\"hi\""));
        TextEdit edit = Utils.queriesProviderEdit(provider, queries).orElseThrow();
        Assert.assertEquals(edit.getRange(), new Range(new Position(0, 0), new Position(0, source.length())));
        Assert.assertEquals(edit.getNewText(),
                Utils.getQueriesDataProviderFunctionTemplate("loadQueriesData", queries).stripLeading());
        Assert.assertEquals(Utils.extractQueryExpressionsFromDataProvider(parse(edit.getNewText()), "loadQueriesData"),
                queries);
    }

    @Test
    public void testHandWrittenLegacyQueryProviderIsLeftAlone() {
        ModulePartNode modulePartNode = parse("isolated function loadQueriesData() returns string[][]|error { "
                + "string[][] rows = []; foreach string line in check io:fileReadLines(\"queries.csv\") { "
                + "rows.push([line]); } return rows; }");
        FunctionDefinitionNode provider = Utils.findFunctionByName(modulePartNode, "loadQueriesData").orElseThrow();

        Assert.assertTrue(Utils.queriesProviderEdit(provider, List.of("\"bye\"")).isEmpty());
    }

    @Test
    public void testDefaultModelImportEdit() {
        JsonObject judged = new JsonObject();
        judged.addProperty("judgeModel", "check ai:getDefaultModelProvider()");
        JsonObject ruleBased = new JsonObject();
        ruleBased.addProperty("targetAgent", "mathAgent");

        TextEdit edit = Utils.defaultModelImportEdit(judged, parse("import ballerina/test;")).orElseThrow();
        Assert.assertEquals(edit.getNewText(), "import ballerina/ai;");
        Assert.assertEquals(edit.getRange(), new Range(new Position(0, 0), new Position(0, 0)));
        Assert.assertTrue(Utils.defaultModelImportEdit(judged, parse("import ballerina/ai;")).isEmpty());
        Assert.assertTrue(Utils.defaultModelImportEdit(ruleBased, parse("import ballerina/test;")).isEmpty());
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
