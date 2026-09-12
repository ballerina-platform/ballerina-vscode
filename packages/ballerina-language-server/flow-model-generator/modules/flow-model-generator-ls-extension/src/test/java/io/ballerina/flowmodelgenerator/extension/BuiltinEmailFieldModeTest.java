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
import com.google.gson.reflect.TypeToken;
import io.ballerina.flowmodelgenerator.extension.request.FlowModelGeneratorRequest;
import io.ballerina.flowmodelgenerator.extension.request.FlowModelNodeTemplateRequest;
import io.ballerina.flowmodelgenerator.extension.request.FlowModelSourceGeneratorRequest;
import io.ballerina.modelgenerator.commons.AbstractLSTest;
import io.ballerina.tools.text.LinePosition;
import org.eclipse.lsp4j.TextEdit;
import org.testng.Assert;
import org.testng.annotations.DataProvider;
import org.testng.annotations.Test;

import java.io.IOException;
import java.lang.reflect.Type;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Tests the TEXT/EXPRESSION dual-typed fields of the Send Email builtin activity over a full
 * read-save cycle: the flow model is generated from source, the mode each field reopens in is
 * asserted, and the same node is fed back to the source generator to check the arguments are
 * regenerated as written.
 *
 * <p>The three {@code sendEmail} calls in the test source cover the three ways a field can appear
 * in source: as a quoted string literal (TEXT), as any other expression (EXPRESSION), and as an
 * argument that is absent altogether (TEXT, matching the fresh node template).
 *
 * <p>Field <em>order</em> is asserted too, against the node template: properties are held in
 * insertion order, so the two builders disagreeing means the form reshuffles itself on save.
 *
 * @since 1.8.0
 */
public class BuiltinEmailFieldModeTest extends AbstractLSTest {

    private static final String SOURCE = "workflow_builtin_activity_email_modes/main.bal";
    private static final String EMAIL_SYMBOL = "sendEmail";
    private static final List<String> EMAIL_FIELDS = List.of("to", "subject", "from", "body");
    private static final String TEXT = "TEXT";
    private static final String EXPRESSION = "EXPRESSION";
    private static final Type TEXT_EDIT_LIST_TYPE = new TypeToken<Map<String, List<TextEdit>>>() { }.getType();

    /** The three sendEmail nodes of {@code notifyCustomer}, in source order. */
    private JsonArray emailNodes;

    @DataProvider(name = "data-provider")
    @Override
    protected Object[] getConfigsList() {
        return new Object[0][];
    }

    @Override
    @Test(dataProvider = "data-provider", enabled = false)
    public void test(Path config) {
    }

    @Test(description = "Quoted string literals reopen in text mode, with the quotes stripped.")
    public void testStringLiteralsOpenInTextMode() throws IOException {
        JsonObject node = emailNode(0);
        assertField(node, "to", TEXT, "user@example.com", "string|string[]");
        assertField(node, "subject", TEXT, "Order update", "string");
        assertField(node, "from", TEXT, "no-reply@example.com", "string");
        assertField(node, "body", TEXT, "Your order has shipped.", "string");
    }

    @Test(description = "Any other expression reopens in expression mode, verbatim.")
    public void testExpressionsOpenInExpressionMode() throws IOException {
        JsonObject node = emailNode(1);
        assertField(node, "to", EXPRESSION, "recipient", "string|string[]");
        assertField(node, "subject", EXPRESSION, "subjectLine", "string");
        assertField(node, "from", EXPRESSION, "recipient", "string");
        assertField(node, "body", EXPRESSION, "subjectLine", "string");
    }

    @Test(description = "An absent argument carries no mode, so it opens in the template's mode: text.")
    public void testAbsentArgumentsOpenInTextMode() throws IOException {
        JsonObject node = emailNode(2);
        for (String field : EMAIL_FIELDS) {
            assertField(node, field, TEXT, "", field.equals("to") ? "string|string[]" : "string");
        }
    }

    @Test(description = "The email fields stay REQUIRED, so the form does not hide them behind a toggle.")
    public void testFieldsAreRequired() throws IOException {
        JsonObject node = emailNode(0);
        for (String field : EMAIL_FIELDS) {
            JsonObject property = node.getAsJsonObject("properties").getAsJsonObject(field);
            Assert.assertFalse(property.has("optional") && property.get("optional").getAsBoolean(),
                    field + " must not be optional: " + property);
            Assert.assertFalse(property.has("advanced") && property.get("advanced").getAsBoolean(),
                    field + " must not be advanced: " + property);
            JsonObject codedata = property.getAsJsonObject("codedata");
            Assert.assertNotNull(codedata, field + " is missing its codedata: " + property);
            Assert.assertEquals(codedata.get("kind").getAsString(), "REQUIRED",
                    field + " must be a REQUIRED parameter: " + codedata);
        }
    }

    @Test(description = "A fresh node and a reopened one order the email fields the same way.")
    public void testFieldOrderMatchesTheNodeTemplate() throws IOException {
        List<String> fresh = emailFieldOrder(emailNodeTemplate());
        List<String> reopened = emailFieldOrder(emailNode(0));
        // Pinned, not just cross-checked: the two builders agreeing on a wrong order would still
        // reorder the form against the sendEmail signature and the generated argument list.
        Assert.assertEquals(fresh, EMAIL_FIELDS, "The node template's email field order changed");
        Assert.assertEquals(reopened, fresh,
                "A reopened node orders the email fields differently from a fresh one, so the form "
                        + "reshuffles when a node is saved and opened again");
    }

    @Test(description = "Text-mode fields are re-quoted on save, so a read-save cycle is a no-op.")
    public void testStringLiteralsRegenerateQuoted() throws IOException {
        Assert.assertEquals(regeneratedArgs(emailNode(0)),
                "{connection: smtpClient, to: \"user@example.com\", subject: \"Order update\", "
                        + "'from: \"no-reply@example.com\", body: \"Your order has shipped.\"}");
    }

    @Test(description = "Expression-mode fields are emitted verbatim, not wrapped in quotes.")
    public void testExpressionsRegenerateVerbatim() throws IOException {
        Assert.assertEquals(regeneratedArgs(emailNode(1)),
                "{connection: smtpClient, to: recipient, subject: subjectLine, "
                        + "'from: recipient, body: subjectLine}");
    }

    @Test(description = "An untouched absent argument stays absent rather than being saved as \"\".")
    public void testAbsentArgumentsStayAbsent() throws IOException {
        Assert.assertEquals(regeneratedArgs(emailNode(2)), "{connection: smtpClient}");
    }

    /**
     * Asserts that {@code field} advertises both modes with only {@code expectedMode} selected, that
     * it carries {@code expectedValue}, and that its EXPRESSION mode advertises
     * {@code expressionType} (the TEXT mode is always {@code string}).
     */
    private void assertField(JsonObject node, String field, String expectedMode, String expectedValue,
                             String expressionType) {
        JsonObject property = node.getAsJsonObject("properties").getAsJsonObject(field);
        Assert.assertNotNull(property, field + " is missing from the node: " + node);

        Map<String, JsonObject> types = new LinkedHashMap<>();
        for (JsonElement type : property.getAsJsonArray("types")) {
            JsonObject typeObject = type.getAsJsonObject();
            types.put(typeObject.get("fieldType").getAsString(), typeObject);
        }
        Assert.assertTrue(types.containsKey(TEXT) && types.containsKey(EXPRESSION),
                field + " must offer both text and expression: " + types.keySet());
        Assert.assertEquals(types.size(), 2, field + " offers unexpected modes: " + types.keySet());

        String otherMode = TEXT.equals(expectedMode) ? EXPRESSION : TEXT;
        Assert.assertTrue(types.get(expectedMode).get("selected").getAsBoolean(),
                field + " should open in " + expectedMode + " mode: " + property);
        Assert.assertFalse(types.get(otherMode).get("selected").getAsBoolean(),
                field + " should not open in " + otherMode + " mode: " + property);

        Assert.assertEquals(types.get(TEXT).get("ballerinaType").getAsString(), "string",
                field + " text mode must be a plain string: " + property);
        Assert.assertEquals(types.get(EXPRESSION).get("ballerinaType").getAsString(), expressionType,
                field + " expression mode advertises the wrong type: " + property);
        Assert.assertEquals(property.get("value").getAsString(), expectedValue,
                field + " carries the wrong value: " + property);
    }

    /**
     * Saves {@code node} back through the source generator and returns the {@code args} mapping
     * constructor of the regenerated {@code callActivity} call.
     */
    private String regeneratedArgs(JsonObject node) throws IOException {
        FlowModelSourceGeneratorRequest request =
                new FlowModelSourceGeneratorRequest(getSourcePath(SOURCE), node);
        JsonObject jsonMap = getResponse(request, getServiceName() + "/getSourceCode")
                .getAsJsonObject("textEdits");
        Map<String, List<TextEdit>> textEdits = gson.fromJson(jsonMap, TEXT_EDIT_LIST_TYPE);

        List<String> calls = new ArrayList<>();
        for (List<TextEdit> edits : textEdits.values()) {
            for (TextEdit edit : edits) {
                if (edit.getNewText().contains(EMAIL_SYMBOL)) {
                    calls.add(edit.getNewText());
                }
            }
        }
        Assert.assertEquals(calls.size(), 1, "Expected a single regenerated call, got: " + calls);

        String args = argsMapping(calls.get(0));
        Assert.assertNotNull(args, "No args mapping in the regenerated call: " + calls.get(0));
        return args;
    }

    /**
     * Returns the first brace-balanced mapping constructor in {@code call} — the {@code args} record
     * of the {@code callActivity} call — or {@code null} when there is none. Braces inside string
     * literals are skipped, and the scan stops at the matching close brace so a trailing argument
     * (such as a retry policy record) is not swallowed.
     */
    private static String argsMapping(String call) {
        int start = call.indexOf('{');
        if (start < 0) {
            return null;
        }
        int depth = 0;
        boolean inString = false;
        for (int i = start; i < call.length(); i++) {
            char c = call.charAt(i);
            if (inString) {
                if (c == '\\') {
                    i++;
                } else if (c == '"') {
                    inString = false;
                }
            } else if (c == '"') {
                inString = true;
            } else if (c == '{') {
                depth++;
            } else if (c == '}' && --depth == 0) {
                return call.substring(start, i + 1);
            }
        }
        return null;
    }

    /** The email field keys of {@code node}, in the order the form renders them. */
    private static List<String> emailFieldOrder(JsonObject node) {
        List<String> order = new ArrayList<>();
        for (String key : node.getAsJsonObject("properties").keySet()) {
            if (EMAIL_FIELDS.contains(key)) {
                order.add(key);
            }
        }
        return order;
    }

    /** The form a fresh Send Email node opens with. */
    private JsonObject emailNodeTemplate() {
        JsonObject codedata = new JsonObject();
        codedata.addProperty("node", "BUILTIN_ACTIVITY");
        codedata.addProperty("org", "ballerina");
        codedata.addProperty("module", "workflow.activity");
        codedata.addProperty("symbol", EMAIL_SYMBOL);
        FlowModelNodeTemplateRequest request = new FlowModelNodeTemplateRequest(getSourcePath(SOURCE),
                LinePosition.from(14, 0), codedata);
        return getResponse(request, getServiceName() + "/getNodeTemplate").getAsJsonObject("flowNode");
    }

    /** The {@code index}-th sendEmail node of {@code notifyCustomer}, in source order. */
    private JsonObject emailNode(int index) throws IOException {
        if (emailNodes == null) {
            FlowModelGeneratorRequest request = new FlowModelGeneratorRequest(getSourcePath(SOURCE),
                    LinePosition.from(10, 0), LinePosition.from(15, 1));
            JsonObject flowModel = getResponse(request).getAsJsonObject("flowModel");

            JsonArray nodes = new JsonArray();
            for (JsonElement node : flowModel.getAsJsonArray("nodes")) {
                JsonObject candidate = node.getAsJsonObject();
                JsonObject codedata = candidate.getAsJsonObject("codedata");
                if (codedata != null && codedata.has("symbol")
                        && EMAIL_SYMBOL.equals(codedata.get("symbol").getAsString())) {
                    nodes.add(candidate);
                }
            }
            Assert.assertEquals(nodes.size(), 3, "Expected the three sendEmail calls, got: " + nodes);
            emailNodes = nodes;
        }
        return emailNodes.get(index).getAsJsonObject();
    }

    @Override
    protected String getResourceDir() {
        return "diagram_generator";
    }

    @Override
    protected Class<? extends AbstractLSTest> clazz() {
        return BuiltinEmailFieldModeTest.class;
    }

    @Override
    protected String getApiName() {
        return "getFlowModel";
    }
}
