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

package io.ballerina.servicemodelgenerator.extension.graphqlcontext;

import io.ballerina.compiler.syntax.tree.FunctionDefinitionNode;
import io.ballerina.compiler.syntax.tree.ModuleMemberDeclarationNode;
import io.ballerina.compiler.syntax.tree.NodeParser;
import io.ballerina.servicemodelgenerator.extension.graphqlcontext.ContextFunctionBody.ContextEntry;
import io.ballerina.tools.text.LinePosition;
import org.testng.Assert;
import org.testng.annotations.DataProvider;
import org.testng.annotations.Test;

import java.util.ArrayList;
import java.util.List;

/**
 * Invariants of reading a context function body as entries and writing it back.
 */
public class ContextFunctionBodyTest {

    private static final String SIGNATURE = "isolated function contextInit(http:RequestContext requestContext, "
            + "http:Request request) returns graphql:Context|error {\n";
    private static final String START = "    graphql:Context context = new;\n";
    private static final String END = "    return context;\n}";

    /**
     * Every source, required and optional, with keys and values that need escaping.
     */
    private static final List<ContextEntry> CORPUS = List.of(
            new ContextEntry("scope", "header", "scope", true),
            new ContextEntry("tenant", "header", "x-tenant", false),
            new ContextEntry("page", "query", "page", true),
            new ContextEntry("lang", "query", "lang", false),
            new ContextEntry("env", "value", "prod", false),
            new ContextEntry("quoted \"key\"", "value", "a \\ b \"c\"\n\td", false),
            new ContextEntry("empty", "value", "", false),
            new ContextEntry("path", "expression", "request.rawPath", false),
            new ContextEntry("sum", "expression", "1 + 2", false),
            new ContextEntry("call", "expression", "check request.getTextPayload()", false));

    @DataProvider(name = "entry-lists")
    public Object[][] entryLists() {
        List<Object[]> lists = new ArrayList<>();
        lists.add(new Object[]{List.of()});
        lists.add(new Object[]{CORPUS});
        for (ContextEntry entry : CORPUS) {
            lists.add(new Object[]{List.of(entry)});
        }
        return lists.toArray(Object[][]::new);
    }

    @Test(dataProvider = "entry-lists")
    public void writtenEntriesReadBackUnchanged(List<ContextEntry> entries) throws Exception {
        // Start from a body with different entries, so the replacement is what is read back.
        String original = function(START + "    context.set(\"old\", \"value\");\n" + END);
        ContextFunctionBody body = ContextFunctionBody.parse(parse(original));
        String rewritten = apply(original, body.replaceEntries(entries));
        Assert.assertEquals(ContextFunctionBody.parse(parse(rewritten)).entries(), entries, rewritten);
        Assert.assertFalse(NodeParser.parseModuleMemberDeclaration(rewritten).hasDiagnostics(), rewritten);
    }

    @Test
    public void rewriteKeepsTheSignatureAndTheFirstAndLastStatements() throws Exception {
        String original = function("    graphql:Context ctx = new graphql:Context();\n"
                + "    ctx.set(\"a\", \"b\");\n    return ctx;\n}");
        String rewritten = apply(original, ContextFunctionBody.parse(parse(original)).replaceEntries(
                List.of(new ContextEntry("scope", "header", "scope", true))));
        Assert.assertEquals(rewritten, function("    graphql:Context ctx = new graphql:Context();\n"
                + "    ctx.set(\"scope\", check request.getHeader(\"scope\"));\n    return ctx;\n}"));
    }

    @DataProvider(name = "not-editable")
    public Object[][] notEditable() {
        return new Object[][]{
                {"a statement other than set", START + "    int count = 0;\n" + END},
                {"a conditional set", START + "    if request.hasHeader(\"a\") {\n"
                        + "        context.set(\"a\", check request.getHeader(\"a\"));\n    }\n" + END},
                {"no declaration first", "    return new;\n}"},
                {"no return last", START + "    context.set(\"a\", \"b\");\n    return new;\n}"},
                {"set on another object", START + "    other.set(\"a\", \"b\");\n" + END},
                {"a computed key", START + "    context.set(key, \"b\");\n" + END},
                {"a named argument", START + "    context.set('key = \"a\", value = \"b\");\n" + END},
                {"an expression body", null},
                {"a comment between sets", START + "    context.set(\"a\", \"b\");\n    // why we read this\n"
                        + "    context.set(\"c\", \"d\");\n" + END},
                {"a comment after the declaration", "    graphql:Context context = new; // note\n"
                        + "    context.set(\"a\", \"b\");\n" + END},
                {"a comment before the return", START + "    context.set(\"a\", \"b\");\n    // note\n" + END},
                {"a comment inside a set", START + "    context.set(\"a\", // note\n        \"b\");\n" + END},
                {"a comment with no sets", START + "    // note\n" + END},
        };
    }

    @Test(dataProvider = "not-editable")
    public void bodiesTheDesignerDoesNotWriteAreNotEditable(String description, String body) {
        String source = body == null
                ? "isolated function contextInit(http:RequestContext requestContext, http:Request request) "
                + "returns graphql:Context|error => new;"
                : function(body);
        Assert.assertThrows(ContextFunctionBody.NotEditableException.class,
                () -> ContextFunctionBody.parse(parse(source)));
    }

    @Test
    public void commentsOutsideTheReplacedSpanStayEditable() throws Exception {
        ContextFunctionBody body = ContextFunctionBody.parse(parse(function("    // build the context\n" + START
                + "    context.set(\"a\", \"b\");\n    return context; // done\n}")));
        Assert.assertEquals(body.entries(), List.of(new ContextEntry("a", "value", "b", false)));
    }

    @Test
    public void anUnknownValueFormReadsAsAnExpression() throws Exception {
        ContextFunctionBody body = ContextFunctionBody.parse(parse(function(START
                + "    context.set(\"a\", check request.getHeader(\"a\").ensureType());\n"
                + "    context.set(\"b\", \"unknown \\u{61} escape\");\n"
                + "    context.set(\"c\", checkpanic request.getQueryParamValue(\"c\").ensureType(string));\n"
                + "    context.set(\"d\", checkpanic request.getHeader(\"d\"));\n" + END)));
        Assert.assertEquals(body.entries(), List.of(
                new ContextEntry("a", "expression", "check request.getHeader(\"a\").ensureType()", false),
                new ContextEntry("b", "expression", "\"unknown \\u{61} escape\"", false),
                new ContextEntry("c", "expression",
                        "checkpanic request.getQueryParamValue(\"c\").ensureType(string)", false),
                new ContextEntry("d", "expression", "checkpanic request.getHeader(\"d\")", false)));
    }

    @DataProvider(name = "invalid")
    public Object[][] invalid() {
        return new Object[][]{
                {List.of(new ContextEntry(" ", "value", "a", false))},
                {List.of(new ContextEntry("a", "value", "1", false), new ContextEntry("a", "value", "2", false))},
                {List.of(new ContextEntry("a", "header", "", true))},
                {List.of(new ContextEntry("a", "query", "  ", false))},
                {List.of(new ContextEntry("a", "expression", "request.", false))},
                {List.of(new ContextEntry("a", "expression", "", false))},
                {List.of(new ContextEntry("a", "expression", "foo // note", false))},
                {List.of(new ContextEntry("a", "expression", "foo // note\n    + bar", false))},
                {List.of(new ContextEntry("a", "cookie", "a", false))},
        };
    }

    @Test(dataProvider = "invalid")
    public void invalidEntriesAreRefused(List<ContextEntry> entries) {
        Assert.assertThrows(IllegalArgumentException.class, () -> ContextFunctionBody.validate(entries));
    }

    private static String function(String body) {
        return SIGNATURE + body;
    }

    private static FunctionDefinitionNode parse(String source) {
        ModuleMemberDeclarationNode member = NodeParser.parseModuleMemberDeclaration(source);
        Assert.assertTrue(member instanceof FunctionDefinitionNode, source);
        return (FunctionDefinitionNode) member;
    }

    private static String apply(String source, ContextFunctionBody.Replacement replacement) {
        int start = offset(source, replacement.start());
        int end = offset(source, replacement.end());
        return source.substring(0, start) + replacement.text() + source.substring(end);
    }

    private static int offset(String source, LinePosition position) {
        int offset = 0;
        for (int line = 0; line < position.line(); line++) {
            offset = source.indexOf('\n', offset) + 1;
        }
        return offset + position.offset();
    }
}
