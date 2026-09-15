/*
 *  Copyright (c) 2025, WSO2 LLC. (http://www.wso2.com)
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
import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.compiler.syntax.tree.Node;
import io.ballerina.compiler.syntax.tree.NodeList;
import io.ballerina.compiler.syntax.tree.ServiceDeclarationNode;
import io.ballerina.servicemodelgenerator.extension.model.Codedata;
import io.ballerina.servicemodelgenerator.extension.model.Function;
import io.ballerina.servicemodelgenerator.extension.model.context.AddModelContext;
import io.ballerina.servicemodelgenerator.extension.model.context.ModelFromSourceContext;
import io.ballerina.servicemodelgenerator.extension.util.AiSourceUtils;
import io.ballerina.servicemodelgenerator.extension.util.Utils;
import io.ballerina.tools.text.LineRange;
import org.eclipse.lsp4j.TextEdit;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

import static io.ballerina.servicemodelgenerator.extension.util.Constants.AI;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.BALLERINA;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.HTTP;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.NEW_LINE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.RESOURCE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.TWO_NEW_LINES;
import static io.ballerina.servicemodelgenerator.extension.util.Utils.importExists;

/**
 * Function builder for AI chat agent services.
 *
 * <p>Exists for two reasons the generic builder cannot cover. Reading a resource back from source
 * needs the resource path rather than the accessor token as its name, and adding the
 * human-in-the-loop {@code decision} resource needs a real body wired to this service's agent
 * rather than the empty skeleton {@code generateFunctionDefSource} produces.
 *
 * @since 1.2.0
 */
public final class AiFunctionBuilder extends AbstractFunctionBuilder {

    /**
     * {@inheritDoc}
     *
     * <p>A generated agent service carries no service-type descriptor, so
     * {@code deriveServiceType} yields {@code "Service"} while the service index only knows
     * {@code ChatService} — the {@code ServiceTypeFunction} lookup in
     * {@code getFunctionInsideService} can never match. It then falls through to
     * {@code getObjectFunctionFromSource}, which ignores {@code relativeResourcePath()} and names
     * the model after the accessor token, yielding {@code kind=OBJECT_METHOD, name="post"} for
     * every resource. {@link Utils#getFunctionModel} is the resource-correct reader the
     * service-level extraction already uses; use it here so both paths agree.
     */
    @Override
    public Function getModelFromSource(ModelFromSourceContext context) {
        if (context.node() instanceof FunctionDefinitionNode functionDefinitionNode
                && functionDefinitionNode.parent() instanceof ServiceDeclarationNode
                && isResource(functionDefinitionNode)) {
            Function functionModel = Utils.getFunctionModel(functionDefinitionNode, Map.of());
            functionModel.setEditable(true);
            return functionModel;
        }
        return super.getModelFromSource(context);
    }

    /**
     * {@inheritDoc}
     *
     * <p>The {@code decision} resource is fixed boilerplate whose body must forward the human's
     * decisions into this service's agent, so it is emitted from a template rather than the generic
     * signature generator — which produces an empty body and cannot express {@code @http:Payload}.
     */
    @Override
    public Map<String, List<TextEdit>> addModel(AddModelContext context) throws Exception {
        Function function = context.function();
        if (!(context.node() instanceof ServiceDeclarationNode serviceNode)
                || Objects.isNull(function.getName())
                || !AiSourceUtils.DECISION_RESOURCE_NAME.equals(function.getName().getValue())) {
            return super.addModel(context);
        }

        // Read the agent off the existing chat resource rather than re-deriving it: the agent is
        // usually declared in another file, and this way a hand-edited chat body still matches.
        AiSourceUtils.AgentCall agentCall = AiSourceUtils.resolveAgentCall(serviceNode)
                .orElseThrow(() -> new IllegalStateException(
                        "Cannot add the decision resource: no agent 'run' call found in this service."));

        // The template is already indented one level, exactly as AiChatServiceBuilder's chat
        // template is — so it is appended as-is rather than re-indented. Members are separated by a
        // blank line, matching how buildServiceNodeBody joins them.
        NodeList<Node> members = serviceNode.members();
        String separator = members.isEmpty() ? NEW_LINE : TWO_NEW_LINES;
        String resourceSource = separator
                + AiSourceUtils.agentDecisionResourceSource(agentCall.agentVarName(), agentCall.operator());

        LineRange anchor = members.isEmpty()
                ? serviceNode.openBraceToken().lineRange()
                : members.get(members.size() - 1).lineRange();

        List<TextEdit> edits = new ArrayList<>();
        edits.add(new TextEdit(Utils.toRange(anchor.endLine()), resourceSource));

        addRequiredImports(context, function, edits);
        return Map.of(context.filePath(), edits);
    }

    /**
     * Any service with a chat resource already imports both modules, but a hand-assembled service
     * might not.
     */
    private void addRequiredImports(AddModelContext context, Function function, List<TextEdit> edits) {
        ModulePartNode rootNode = context.document().syntaxTree().rootNode();
        Codedata codedata = function.getCodedata();
        String orgName = Objects.nonNull(codedata) && Objects.nonNull(codedata.getOrgName())
                ? codedata.getOrgName()
                : BALLERINA;

        Set<String> importStmts = new LinkedHashSet<>();
        if (!importExists(rootNode, BALLERINA, HTTP)) {
            importStmts.add(Utils.getImportStmt(BALLERINA, HTTP));
        }
        if (!importExists(rootNode, orgName, AI)) {
            importStmts.add(Utils.getImportStmt(orgName, AI));
        }
        if (!importStmts.isEmpty()) {
            edits.addFirst(new TextEdit(Utils.toRange(rootNode.lineRange().startLine()),
                    String.join(NEW_LINE, importStmts)));
        }
    }

    private static boolean isResource(FunctionDefinitionNode functionDefinitionNode) {
        return functionDefinitionNode.qualifierList().stream()
                .anyMatch(qualifier -> qualifier.text().equals(RESOURCE));
    }

    @Override
    public String kind() {
        return AI;
    }
}
