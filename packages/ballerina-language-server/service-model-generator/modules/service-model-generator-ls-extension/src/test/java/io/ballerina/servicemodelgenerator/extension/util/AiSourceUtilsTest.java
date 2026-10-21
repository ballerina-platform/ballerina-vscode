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

package io.ballerina.servicemodelgenerator.extension.util;

import io.ballerina.compiler.syntax.tree.FunctionDefinitionNode;
import io.ballerina.compiler.syntax.tree.ModuleMemberDeclarationNode;
import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.compiler.syntax.tree.Node;
import io.ballerina.compiler.syntax.tree.ServiceDeclarationNode;
import io.ballerina.compiler.syntax.tree.SyntaxTree;
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
 * Direct unit tests for the resource templates and the request headers helpers in {@link AiSourceUtils}.
 *
 * @since 1.9.0
 */
public class AiSourceUtilsTest {

    @Test
    public void testObjectMethodOperatorGeneratesResumeVariableAndDotCall() {
        String source = AiSourceUtils.agentDecisionResourceSource("supportAgent", ".");

        Assert.assertTrue(source.contains("resource function post decision(@http:Payload ai:DecisionMessage request)"),
                "must declare the decision resource with the fixed accessor, name and payload type");
        Assert.assertTrue(source.contains("returns ai:ChatRespMessage|error"),
                "must declare the fixed return type");
        Assert.assertTrue(source.contains("ai:Resume resume = {decisions: request.decisions};"),
                "the ai:Resume value must be assigned to a local variable built from request.decisions");
        Assert.assertTrue(source.contains("check supportAgent.run(resume, request.sessionId)"),
                "an object-method agent must be invoked with '.', passing the resume variable and " +
                        "request.sessionId");
    }

    @Test
    public void testRemoteMethodOperatorGeneratesResumeVariableAndArrowCall() {
        String source = AiSourceUtils.agentDecisionResourceSource("supportAgent", "->");

        Assert.assertTrue(source.contains("ai:Resume resume = {decisions: request.decisions};"),
                "the ai:Resume value must be assigned to a local variable built from request.decisions " +
                        "regardless of the call operator");
        Assert.assertTrue(source.contains("check supportAgent->run(resume, request.sessionId)"),
                "a remote-method agent must be invoked with '->', passing the resume variable and " +
                        "request.sessionId");
    }

    @Test
    public void testDecisionResourceWithHeaders() {
        String source = AiSourceUtils.agentDecisionResourceSource("supportAgent", ".", true);

        Assert.assertTrue(source.contains("resource function post decision(@http:Payload ai:DecisionMessage request, "
                        + "http:Headers headers)"),
                "the decision resource must take the request headers as the second parameter");
        Assert.assertEquals(AiSourceUtils.agentDecisionResourceSource("supportAgent", ".", false),
                AiSourceUtils.agentDecisionResourceSource("supportAgent", "."),
                "without headers the decision resource must match the existing template");
    }

    @Test
    public void testOnlyChatAndDecisionAreAgentResources() {
        List<String> agentResources = new ArrayList<>();
        for (Node member : serviceNode(service(false)).members()) {
            if (member instanceof FunctionDefinitionNode resource && AiSourceUtils.isAgentResource(resource)) {
                agentResources.add(resource.relativeResourcePath().get(0).toSourceCode().trim());
            }
        }

        Assert.assertEquals(agentResources, List.of("chat", "decision"),
                "other resources, such as `get health`, must not be treated as agent resources");
    }

    @Test
    public void testHeadersParamEditsAddHeaders() {
        String source = service(false);
        ServiceDeclarationNode serviceNode = serviceNode(source);
        Assert.assertFalse(AiSourceUtils.hasHeadersParam(serviceNode));

        String updated = apply(source, headersEdits(serviceNode, true));

        Assert.assertEquals(updated, service(true),
                "chat and decision must both get the headers parameter, and nothing else may change");
        Assert.assertTrue(AiSourceUtils.hasHeadersParam(serviceNode(updated)));
    }

    @Test
    public void testHeadersParamEditsRemoveHeaders() {
        String source = service(true);
        ServiceDeclarationNode serviceNode = serviceNode(source);
        Assert.assertTrue(AiSourceUtils.hasHeadersParam(serviceNode));

        String updated = apply(source, headersEdits(serviceNode, false));

        Assert.assertEquals(updated, service(false),
                "the headers parameter must be removed from chat and decision with its comma");
        Assert.assertFalse(AiSourceUtils.hasHeadersParam(serviceNode(updated)));
    }

    @Test
    public void testHeadersParamEditsAreNoOpWhenAlreadyInPlace() {
        Assert.assertTrue(headersEdits(serviceNode(service(true)), true).isEmpty(),
                "adding headers must not touch resources that already take them");
        Assert.assertTrue(headersEdits(serviceNode(service(false)), false).isEmpty(),
                "removing headers must not touch resources that do not take them");
    }

    @Test
    public void testRenamedHeadersParamIsDetectedAndRemoved() {
        String source = "service /chat on aiListener {\n"
                + "    resource function post chat(@http:Payload ai:ChatReqMessage request, http:Headers h) "
                + "returns ai:ChatRespMessage|error {\n"
                + "        return {message: \"\"};\n"
                + "    }\n"
                + "}\n";
        ServiceDeclarationNode serviceNode = serviceNode(source);
        Assert.assertTrue(AiSourceUtils.hasHeadersParam(serviceNode),
                "the headers parameter must be found by its type, not its name");

        String updated = apply(source, headersEdits(serviceNode, false));

        Assert.assertTrue(updated.contains("post chat(@http:Payload ai:ChatReqMessage request) returns"),
                "a renamed headers parameter must still be removed");
    }

    @Test
    public void testHeadersParamWithAliasedHttpImportIsDetectedAndRemoved() {
        String source = "service /chat on aiListener {\n"
                + "    resource function post chat(@h:Payload ai:ChatReqMessage request, h:Headers headers) "
                + "returns ai:ChatRespMessage|error {\n"
                + "        return {message: \"\"};\n"
                + "    }\n"
                + "}\n";
        ServiceDeclarationNode serviceNode = serviceNode(source);
        Assert.assertTrue(AiSourceUtils.hasHeadersParam(serviceNode),
                "the headers parameter must be found whatever prefix http is imported under");
        Assert.assertTrue(headersEdits(serviceNode, true).isEmpty(),
                "adding headers must not add a second parameter next to an aliased one");

        String updated = apply(source, headersEdits(serviceNode, false));

        Assert.assertTrue(updated.contains("post chat(@h:Payload ai:ChatReqMessage request) returns"),
                "an aliased headers parameter must still be removed");
    }

    private static String service(boolean withHeaders) {
        return "service /chat on aiListener {\n"
                + chatResource(withHeaders) + "\n\n"
                + AiSourceUtils.agentDecisionResourceSource("supportAgent", ".", withHeaders) + "\n\n"
                + "    resource function get health() returns string {\n"
                + "        return \"ok\";\n"
                + "    }\n"
                + "}\n";
    }

    private static String chatResource(boolean withHeaders) {
        String chat = AiSourceUtils.agentChatResourceSource("supportAgent", ".");
        return withHeaders
                ? chat.replace("ai:ChatReqMessage request)", "ai:ChatReqMessage request, http:Headers headers)")
                : chat;
    }

    private static List<TextEdit> headersEdits(ServiceDeclarationNode serviceNode, boolean enable) {
        List<TextEdit> edits = new ArrayList<>();
        for (Node member : serviceNode.members()) {
            if (member instanceof FunctionDefinitionNode resource && AiSourceUtils.isAgentResource(resource)) {
                edits.addAll(AiSourceUtils.headersParamEdits(resource, enable));
            }
        }
        return edits;
    }

    private static ServiceDeclarationNode serviceNode(String source) {
        SyntaxTree syntaxTree = SyntaxTree.from(TextDocuments.from(source), "main.bal");
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
