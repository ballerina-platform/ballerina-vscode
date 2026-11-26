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

package io.ballerina.flowmodelgenerator.extension;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import io.ballerina.flowmodelgenerator.core.expressioneditor.ExpressionEditorContext;
import io.ballerina.flowmodelgenerator.extension.request.ExpressionEditorCompletionRequest;
import io.ballerina.flowmodelgenerator.extension.request.ExpressionEditorDiagnosticsRequest;
import io.ballerina.flowmodelgenerator.extension.request.ExpressionEditorTypesRequest;
import io.ballerina.flowmodelgenerator.extension.request.VisibleVariableTypeRequest;
import io.ballerina.modelgenerator.commons.AbstractLSTest;
import io.ballerina.modelgenerator.commons.CommonUtils;
import io.ballerina.tools.text.LinePosition;
import org.eclipse.lsp4j.CompletionContext;
import org.eclipse.lsp4j.CompletionTriggerKind;
import org.eclipse.lsp4j.DidChangeTextDocumentParams;
import org.eclipse.lsp4j.TextDocumentContentChangeEvent;
import org.eclipse.lsp4j.VersionedTextDocumentIdentifier;
import org.testng.Assert;
import org.testng.annotations.AfterMethod;
import org.testng.annotations.BeforeMethod;
import org.testng.annotations.Test;

import java.io.IOException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;

/**
 * Tests that the probe imports an expression check leaves in the expression copy never reach another request.
 *
 * @since 1.9.0
 */
public class ExpressionEditorKeptImportsTest extends AbstractLSTest {

    private static final LinePosition MODULE_LEVEL = LinePosition.from(1, 0);
    private static final LinePosition IMPORT_LINE = LinePosition.from(0, 22);
    private static final LinePosition IN_FUNCTION = LinePosition.from(12, 8);
    private static final String CERT = """
            {"metadata": {"label": "Cert"},
             "types": [{"fieldType": "EXPRESSION", "ballerinaType": "crypto:TrustStore|string", "selected": true}],
             "imports": {"crypto": "ballerina/crypto:2.13.0"}}""";
    private static final String PLAIN = """
            {"metadata": {"label": "Value"}, "types": [{"fieldType": "EXPRESSION", "selected": true}]}""";

    private String sourcePath;
    private int version = 1;

    @BeforeMethod
    public void open() throws IOException {
        sourcePath = getSourcePath("source.bal");
        notifyDidOpen(sourcePath);
    }

    @AfterMethod
    public void close() {
        notifyDidClose(sourcePath);
    }

    @Override
    @Test(enabled = false)
    public void test(Path config) {
    }

    @Test
    public void testFieldKeepsCheckingAgainstItsKeptImport() throws Exception {
        Assert.assertTrue(messages(check("5", CERT, "cert", MODULE_LEVEL)).toString().contains("TrustStore"));
        Assert.assertEquals(messages(check("\"ca.pem\"", CERT, "cert", MODULE_LEVEL)), List.of());
        Assert.assertTrue(messages(check("6", CERT, "cert", MODULE_LEVEL)).toString().contains("TrustStore"));
    }

    @Test
    public void testOtherFieldNamingTheKeptPrefixStillMissesTheImport() throws Exception {
        List<String> fresh = messages(check("crypto:hashMd5([])", PLAIN, "other", MODULE_LEVEL));
        check("5", CERT, "cert", MODULE_LEVEL);
        Assert.assertEquals(messages(check("crypto:hashMd5([])", PLAIN, "other", MODULE_LEVEL)), fresh);
        Assert.assertTrue(fresh.toString().contains("undefined module"), fresh.toString());
    }

    @Test
    public void testOtherFieldNotNamingTheKeptPrefixIsUnchanged() throws Exception {
        List<String> fresh = messages(check("undefinedName + 1", PLAIN, "other", MODULE_LEVEL));
        check("5", CERT, "cert", MODULE_LEVEL);
        Assert.assertEquals(messages(check("undefinedName + 1", PLAIN, "other", MODULE_LEVEL)), fresh);
        Assert.assertEquals(messages(check("1 + 1", PLAIN, "other", MODULE_LEVEL)), List.of());
        Assert.assertTrue(messages(check("5", CERT, "cert", MODULE_LEVEL)).toString().contains("TrustStore"));
    }

    @Test
    public void testCompletionInOtherFieldOffersOnlyTheFileImports() throws Exception {
        List<String> fresh = modules(complete("cry", PLAIN, MODULE_LEVEL));
        check("5", CERT, "cert", MODULE_LEVEL);
        Assert.assertEquals(modules(complete("cry", PLAIN, MODULE_LEVEL)), fresh);
        Assert.assertFalse(fresh.contains("crypto"), fresh.toString());
        Assert.assertTrue(modules(complete("cry", CERT, MODULE_LEVEL)).contains("crypto"));
    }

    @Test
    public void testTypesAndVisibleTypesAreUnchanged() throws Exception {
        String types = request("types", new ExpressionEditorTypesRequest(sourcePath, null, IN_FUNCTION, false));
        String variables = request("visibleVariableTypes", new VisibleVariableTypeRequest(sourcePath, IN_FUNCTION));
        check("5", CERT, "cert", MODULE_LEVEL);
        Assert.assertEquals(request("types", new ExpressionEditorTypesRequest(sourcePath, null, IN_FUNCTION, false)),
                types);
        check("5", CERT, "cert", MODULE_LEVEL);
        Assert.assertEquals(request("visibleVariableTypes",
                new VisibleVariableTypeRequest(sourcePath, IN_FUNCTION)), variables);
    }

    @Test
    public void testEditOfTheFileReplacesKeptImports() throws Exception {
        check("5", CERT, "cert", MODULE_LEVEL);
        change(getText(sourcePath) + System.lineSeparator() + "int added = 1;" + System.lineSeparator());
        Assert.assertEquals(messages(check("added + 1", PLAIN, "other", MODULE_LEVEL)), List.of());
        Assert.assertTrue(messages(check("crypto:hashMd5([])", PLAIN, "other", MODULE_LEVEL)).toString()
                .contains("undefined module"));
        Assert.assertTrue(messages(check("5", CERT, "cert", MODULE_LEVEL)).toString().contains("TrustStore"));
    }

    @Test
    public void testCheckBringingTheKeptModuleKeepsIt() throws Exception {
        String time = """
                {"metadata": {"label": "Value"}, "types": [{"fieldType": "EXPRESSION", "selected": true}],
                 "imports": {"time": "ballerina/time"}}""";
        check("time:utcToString(time:utcNow())", time, null, MODULE_LEVEL);
        Assert.assertEquals(messages(check("time:utcToString(time:utcNow())", time, "expression", MODULE_LEVEL)),
                List.of());
    }

    @Test
    public void testCheckAfterARevertAddsItsOwnImport() throws Exception {
        String both = """
                {"metadata": {"label": "Value"}, "types": [{"fieldType": "EXPRESSION", "selected": true}],
                 "imports": {"crypto": "ballerina/crypto:2.13.0", "time": "ballerina/time"}}""";
        String crypto = """
                {"metadata": {"label": "Value"}, "types": [{"fieldType": "EXPRESSION", "selected": true}],
                 "imports": {"crypto": "ballerina/crypto:2.13.0"}}""";
        check("5", CERT, "cert", MODULE_LEVEL);
        Assert.assertEquals(messages(check("time:utcNow()", both, "both", MODULE_LEVEL)), List.of());
        Assert.assertEquals(messages(check("crypto:hashMd5([])", crypto, "digest", MODULE_LEVEL)), List.of());
    }

    @Test
    public void testStatementOnTheImportLineKeepsNoImport() throws Exception {
        Assert.assertTrue(messages(check("5", CERT, "cert", IMPORT_LINE)).toString().contains("TrustStore"));
        Assert.assertTrue(messages(check("crypto:hashMd5([])", PLAIN, "other", MODULE_LEVEL)).toString()
                .contains("undefined module"));
    }

    private JsonObject check(String expression, String property, String fieldKey, LinePosition position)
            throws Exception {
        ExpressionEditorContext.Info info = new ExpressionEditorContext.Info(expression, position, 0, 0, null,
                JsonParser.parseString(property).getAsJsonObject(), null, fieldKey);
        return JsonParser.parseString(request("diagnostics", new ExpressionEditorDiagnosticsRequest(sourcePath,
                info))).getAsJsonObject();
    }

    private JsonElement complete(String expression, String property, LinePosition position) throws Exception {
        ExpressionEditorContext.Info info = new ExpressionEditorContext.Info(expression, position,
                expression.length(), 0, null, JsonParser.parseString(property).getAsJsonObject(), null, "other");
        CompletionContext completionContext = new CompletionContext(CompletionTriggerKind.Invoked);
        return JsonParser.parseString(request("completion",
                new ExpressionEditorCompletionRequest(sourcePath, info, completionContext)));
    }

    private String request(String api, Object params) throws Exception {
        return gson.toJson(serviceEndpoint.request(getServiceName() + "/" + api, params).get(20, TimeUnit.SECONDS));
    }

    private static List<String> messages(JsonObject diagnostics) {
        List<String> messages = new ArrayList<>();
        diagnostics.getAsJsonArray("diagnostics")
                .forEach(diagnostic -> messages.add(diagnostic.getAsJsonObject().get("message").getAsString()));
        return messages.stream().sorted().toList();
    }

    // The modules a completion offers as imported, which a field can use without adding an import.
    private static List<String> modules(JsonElement completions) {
        JsonElement list = completions.isJsonObject() && completions.getAsJsonObject().has("left")
                ? completions.getAsJsonObject().get("left") : completions;
        if (list.isJsonObject() && list.getAsJsonObject().has("right")) {
            list = list.getAsJsonObject().get("right");
        }
        JsonArray items = list.isJsonArray() ? list.getAsJsonArray() : list.getAsJsonObject().getAsJsonArray("items");
        List<String> modules = new ArrayList<>();
        items.forEach(item -> {
            JsonObject object = item.getAsJsonObject();
            if ("Module".equals(object.get("kind").getAsString())) {
                modules.add(object.get("label").getAsString());
            }
        });
        return modules.stream().sorted().toList();
    }

    private void change(String text) {
        VersionedTextDocumentIdentifier document = new VersionedTextDocumentIdentifier(
                CommonUtils.getExprUri(sourcePath), ++version);
        sendNotification("textDocument/didChange",
                new DidChangeTextDocumentParams(document, List.of(new TextDocumentContentChangeEvent(text))));
    }

    @Override
    protected String getResourceDir() {
        return "diagnostics";
    }

    @Override
    protected Class<? extends AbstractLSTest> clazz() {
        return ExpressionEditorKeptImportsTest.class;
    }

    @Override
    protected String getApiName() {
        return "diagnostics";
    }

    @Override
    protected String getServiceName() {
        return "expressionEditor";
    }
}
