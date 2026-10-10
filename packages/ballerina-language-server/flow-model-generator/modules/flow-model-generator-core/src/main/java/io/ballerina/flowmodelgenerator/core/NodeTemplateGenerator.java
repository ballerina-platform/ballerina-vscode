package io.ballerina.flowmodelgenerator.core;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import io.ballerina.flowmodelgenerator.core.model.Codedata;
import io.ballerina.flowmodelgenerator.core.model.FlowNode;
import io.ballerina.flowmodelgenerator.core.model.NodeBuilder;
import io.ballerina.flowmodelgenerator.core.model.NodeKind;
import io.ballerina.modelgenerator.commons.ModuleInfo;
import io.ballerina.tools.text.LinePosition;
import org.ballerinalang.langserver.LSClientLogger;
import org.ballerinalang.langserver.commons.workspace.WorkspaceManager;

import java.nio.file.Path;

import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.RUN_METHOD_NAME;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.SEND_DATA_METHOD_NAME;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.WORKFLOW_MODULE;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.WORKFLOW_ORG;

/**
 * Generates the node template for the given node kind.
 *
 * @since 1.0.0
 */
public class NodeTemplateGenerator {

    private static final Gson gson = new GsonBuilder().setPrettyPrinting().disableHtmlEscaping().create();
    private final LSClientLogger lsClientLogger;

    public NodeTemplateGenerator(LSClientLogger lsClientLogger) {
        this.lsClientLogger = lsClientLogger;
    }

    public JsonElement getNodeTemplate(WorkspaceManager workspaceManager, Path filePath, LinePosition position,
                                       JsonObject id) {
        Codedata codedata = toWorkflowCodedata(gson.fromJson(id, Codedata.class));
        NodeBuilder nodeBuilder = NodeBuilder.getNodeFromKind(codedata.node());
        workspaceManager.document(filePath)
                .map(doc -> ModuleInfo.from(doc.module().descriptor()))
                .ifPresent(nodeBuilder::defaultModuleName);
        FlowNode flowNode = nodeBuilder
                .setConstData()
                .setTemplateData(
                        new NodeBuilder.TemplateContext(workspaceManager, filePath, position, codedata, lsClientLogger))
                .build();
        return gson.toJsonTree(flowNode);
    }

    /**
     * Maps a function search pick of {@code workflow:run} or {@code workflow:sendData} to the Run Workflow or Send
     * Data node. Their first parameter is a bare {@code function}, which the generic function call form cannot fill;
     * the workflow nodes offer the project's workflows in a dropdown instead. The symbol is dropped because those
     * nodes read it as the name of the selected workflow. {@code packageName} and {@code lineRange} are not carried
     * either: neither builder reads them, both import {@code ballerina/workflow} by constant, and the insert position
     * comes from the template context.
     */
    private static Codedata toWorkflowCodedata(Codedata codedata) {
        if (codedata.node() != NodeKind.FUNCTION_CALL || !WORKFLOW_ORG.equals(codedata.org())
                || !WORKFLOW_MODULE.equals(codedata.module())) {
            return codedata;
        }
        NodeKind workflowNode;
        if (RUN_METHOD_NAME.equals(codedata.symbol())) {
            workflowNode = NodeKind.WORKFLOW_RUN;
        } else if (SEND_DATA_METHOD_NAME.equals(codedata.symbol())) {
            workflowNode = NodeKind.SEND_DATA;
        } else {
            return codedata;
        }
        return new Codedata.Builder<>(null)
                .node(workflowNode)
                .org(codedata.org())
                .module(codedata.module())
                .version(codedata.version())
                .build();
    }
}
