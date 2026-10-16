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

package io.ballerina.servicemodelgenerator.extension.builder.function;

import io.ballerina.compiler.syntax.tree.FunctionDefinitionNode;
import io.ballerina.compiler.syntax.tree.ModuleMemberDeclarationNode;
import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.compiler.syntax.tree.Node;
import io.ballerina.compiler.syntax.tree.ServiceDeclarationNode;
import io.ballerina.compiler.syntax.tree.SyntaxTree;
import io.ballerina.servicemodelgenerator.extension.model.Function;
import io.ballerina.servicemodelgenerator.extension.model.Parameter;
import io.ballerina.servicemodelgenerator.extension.model.context.ModelFromSourceContext;
import io.ballerina.servicemodelgenerator.extension.model.context.UpdateModelContext;
import io.ballerina.tools.text.LinePosition;
import io.ballerina.tools.text.TextDocument;
import io.ballerina.tools.text.TextDocuments;
import org.eclipse.lsp4j.Position;
import org.eclipse.lsp4j.TextEdit;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * Tests the request headers option that {@link AiFunctionBuilder} offers on a {@code chat} or
 * {@code decision} resource.
 *
 * @since 1.9.0
 */
public class AiFunctionBuilderTest {

    private static final String FILE_PATH = "main.bal";

    private static final String SERVICE_WITHOUT_HEADERS = """
            service /chat on aiListener {
                resource function post chat(@http:Payload ai:ChatReqMessage request) returns ai:ChatRespMessage|error {
                    return {message: ""};
                }

                resource function post decision(@http:Payload ai:DecisionMessage request) \
            returns ai:ChatRespMessage|error {
                    return {message: ""};
                }

                resource function get health() returns string {
                    return "ok";
                }
            }
            """;

    private static final String SERVICE_WITH_CHAT_HEADERS = SERVICE_WITHOUT_HEADERS.replace(
            "ai:ChatReqMessage request)", "ai:ChatReqMessage request, http:Headers headers)");

    @Test
    public void testResourceWithoutHeadersOffersADisabledOption() {
        Function model = modelOf(SERVICE_WITHOUT_HEADERS, "chat");

        Parameter headers = headersParameter(model);
        Assert.assertFalse(headers.isEnabled(), "the option must be off when the resource has no headers");
        Assert.assertTrue(headers.isEditable(), "the option must be editable");
        Assert.assertEquals(headers.getType().getValue(), "http:Headers");
        Assert.assertEquals(model.getParameters().size(), 2,
                "the payload parameter and the headers option are all a resource shows");
        Assert.assertFalse(model.isCanAddParameters(), "no other parameter may be added");
    }

    @Test
    public void testResourceWithHeadersOffersAnEnabledOption() {
        Function model = modelOf(SERVICE_WITH_CHAT_HEADERS, "chat");

        Assert.assertTrue(headersParameter(model).isEnabled(), "the option must be on when the resource has headers");
        Assert.assertEquals(model.getParameters().size(), 2, "the headers parameter must not be listed twice");
    }

    @Test
    public void testDecisionIsToggledIndependentlyOfChat() {
        Assert.assertTrue(headersParameter(modelOf(SERVICE_WITH_CHAT_HEADERS, "chat")).isEnabled());
        Assert.assertFalse(headersParameter(modelOf(SERVICE_WITH_CHAT_HEADERS, "decision")).isEnabled(),
                "decision must report its own state, not chat's");
    }

    @Test
    public void testOtherResourcesDoNotOfferTheOption() {
        Function model = modelOf(SERVICE_WITHOUT_HEADERS, "health");

        Assert.assertTrue(model.getParameters().stream().noneMatch(p -> p.getType().getValue().endsWith("Headers")),
                "only chat and decision offer the request headers option");
    }

    @Test
    public void testEnablingTheOptionAddsOnlyTheHeadersParameter() {
        String updated = update(SERVICE_WITHOUT_HEADERS, "chat", true);

        Assert.assertTrue(updated.contains("resource function post chat(@http:Payload ai:ChatReqMessage request, "
                + "http:Headers headers) returns ai:ChatRespMessage|error {"),
                "chat must keep @http:Payload and gain the headers parameter");
        Assert.assertTrue(updated.contains("post decision(@http:Payload ai:DecisionMessage request) returns"),
                "decision must be left alone");
        Assert.assertEquals(updated.replace(", http:Headers headers", ""), SERVICE_WITHOUT_HEADERS,
                "nothing but the parameter may change");
    }

    @Test
    public void testDisablingTheOptionRemovesOnlyTheHeadersParameter() {
        String updated = update(SERVICE_WITH_CHAT_HEADERS, "chat", false);

        Assert.assertEquals(updated, SERVICE_WITHOUT_HEADERS, "the headers parameter must be removed, nothing else");
    }

    @Test
    public void testUnchangedOptionProducesNoEdits() {
        Assert.assertTrue(updateEdits(SERVICE_WITH_CHAT_HEADERS, "chat", true).isEmpty());
        Assert.assertTrue(updateEdits(SERVICE_WITHOUT_HEADERS, "chat", false).isEmpty());
    }

    private static Function modelOf(String source, String resourceName) {
        FunctionDefinitionNode resource = resource(serviceNode(source), resourceName);
        ModelFromSourceContext context = new ModelFromSourceContext(resource, null, null, null, FILE_PATH, null,
                null, null, null, null);
        return new AiFunctionBuilder().getModelFromSource(context);
    }

    private static String update(String source, String resourceName, boolean withHeaders) {
        return apply(source, updateEdits(source, resourceName, withHeaders));
    }

    private static List<TextEdit> updateEdits(String source, String resourceName, boolean withHeaders) {
        ServiceDeclarationNode serviceNode = serviceNode(source);
        FunctionDefinitionNode resource = resource(serviceNode, resourceName);
        Function model = modelOf(source, resourceName);
        headersParameter(model).setEnabled(withHeaders);
        UpdateModelContext context = new UpdateModelContext(null, model, null, null, null, FILE_PATH, null,
                serviceNode, resource);
        return new AiFunctionBuilder().updateModel(context).get(FILE_PATH);
    }

    private static Parameter headersParameter(Function model) {
        return model.getParameters().stream()
                .filter(parameter -> parameter.getType().getValue().endsWith("Headers"))
                .findFirst()
                .orElseThrow(() -> new AssertionError("no headers parameter in the model"));
    }

    private static FunctionDefinitionNode resource(ServiceDeclarationNode serviceNode, String name) {
        for (Node member : serviceNode.members()) {
            if (member instanceof FunctionDefinitionNode function
                    && function.relativeResourcePath().get(0).toSourceCode().trim().equals(name)) {
                return function;
            }
        }
        throw new AssertionError("no resource named " + name);
    }

    private static ServiceDeclarationNode serviceNode(String source) {
        SyntaxTree syntaxTree = SyntaxTree.from(TextDocuments.from(source), FILE_PATH);
        for (ModuleMemberDeclarationNode member : ((ModulePartNode) syntaxTree.rootNode()).members()) {
            if (member instanceof ServiceDeclarationNode serviceNode) {
                return serviceNode;
            }
        }
        throw new IllegalStateException("No service declaration in the test source");
    }

    /**
     * Applies non-overlapping edits from the last to the first, so earlier offsets stay valid.
     */
    private static String apply(String source, List<TextEdit> edits) {
        TextDocument document = TextDocuments.from(source);
        List<TextEdit> sorted = new ArrayList<>(edits);
        sorted.sort(Comparator.comparingInt((TextEdit edit) -> offset(document, edit.getRange().getStart()))
                .reversed());
        StringBuilder builder = new StringBuilder(source);
        for (TextEdit edit : sorted) {
            builder.replace(offset(document, edit.getRange().getStart()), offset(document, edit.getRange().getEnd()),
                    edit.getNewText());
        }
        return builder.toString();
    }

    private static int offset(TextDocument document, Position position) {
        return document.textPositionFrom(LinePosition.from(position.getLine(), position.getCharacter()));
    }
}
