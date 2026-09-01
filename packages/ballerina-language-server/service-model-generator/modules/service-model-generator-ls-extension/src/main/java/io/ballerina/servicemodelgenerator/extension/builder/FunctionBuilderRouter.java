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

package io.ballerina.servicemodelgenerator.extension.builder;

import io.ballerina.compiler.api.ModuleID;
import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.syntax.tree.FunctionDefinitionNode;
import io.ballerina.compiler.syntax.tree.Node;
import io.ballerina.compiler.syntax.tree.NonTerminalNode;
import io.ballerina.compiler.syntax.tree.ServiceDeclarationNode;
import io.ballerina.projects.Document;
import io.ballerina.projects.Project;
import io.ballerina.servicemodelgenerator.extension.builder.function.DefaultFunctionBuilder;
import io.ballerina.servicemodelgenerator.extension.builder.function.GraphqlFunctionBuilder;
import io.ballerina.servicemodelgenerator.extension.builder.function.HttpFunctionBuilder;
import io.ballerina.servicemodelgenerator.extension.builder.function.SchemaDrivenFunctionBuilder;
import io.ballerina.servicemodelgenerator.extension.connector.TriggerModelReader;
import io.ballerina.servicemodelgenerator.extension.model.Codedata;
import io.ballerina.servicemodelgenerator.extension.model.Function;
import io.ballerina.servicemodelgenerator.extension.model.ServiceMetadata;
import io.ballerina.servicemodelgenerator.extension.model.context.AddModelContext;
import io.ballerina.servicemodelgenerator.extension.model.context.GetModelContext;
import io.ballerina.servicemodelgenerator.extension.model.context.ModelFromSourceContext;
import io.ballerina.servicemodelgenerator.extension.model.context.UpdateModelContext;
import org.ballerinalang.langserver.commons.workspace.WorkspaceManager;
import org.eclipse.lsp4j.TextEdit;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.Supplier;

import static io.ballerina.servicemodelgenerator.extension.util.Constants.DEFAULT;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.GRAPHQL;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.HTTP;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.OBJECT_METHOD;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.TCP;
import static io.ballerina.servicemodelgenerator.extension.util.ServiceModelUtils.deriveServiceType;

/**
 * Represents the function builder router of the service model generator.
 *
 * @since 1.2.0
 */
public class FunctionBuilderRouter {
    // FTP/KAFKA/RABBITMQ/MSSQL/POSTGRESQL/MYSQL/MCP/SOLACE are deliberately absent: each now ships a
    // bundled TriggerUISchemaModel schema (see TriggerModelReader.BUNDLED_TRIGGER_MODEL_RESOURCES), so
    // useSchemaDrivenPath always routes them to SchemaDrivenFunctionBuilder before this map is
    // consulted — a hardcoded entry here would be dead code. HTTP/GRAPHQL are not (yet) schema-driven
    // and keep their dedicated builders.
    private static final Map<String, Supplier<? extends NodeBuilder<Function>>> CONSTRUCTOR_MAP = new HashMap<>() {{
        put(HTTP, HttpFunctionBuilder::new);
        put(GRAPHQL, GraphqlFunctionBuilder::new);
    }};

    /** Protocols with dedicated, mature builders that must never fall through to the schema-driven
     * path, regardless of what {@link TriggerModelReader} resolves for them now or in the future. */
    private static final Set<String> NEVER_SCHEMA_DRIVEN = Set.of(HTTP, GRAPHQL, TCP);

    private static NodeBuilder<Function> getFunctionBuilder(String protocol) {
        return CONSTRUCTOR_MAP.getOrDefault(protocol, DefaultFunctionBuilder::new).get();
    }

    /**
     * Returns {@code true} when the connector's schema is bundled as a classpath resource in this jar,
     * or -- on a miss, when {@code orgName} is known -- synthesizable from the connector's own shipped
     * {@code resources/trigger-authoring.json} plus semantic-API introspection of its {@code .bala}
     * (see {@link TriggerModelReader#getSchemaDrivenTriggerModel}). Mirrors
     * {@code ServiceBuilderRouter} (the hardcoded builder still wins whenever neither source has a
     * model). {@code orgName == null} degrades to the bundled-only check -- {@link #getModelTemplate}
     * has no org field to resolve a {@code .bala} with. {@link #NEVER_SCHEMA_DRIVEN} short-circuits
     * this to {@code false} unconditionally.
     */
    private static boolean useSchemaDrivenPath(String orgName, String moduleName) {
        if (moduleName == null || NEVER_SCHEMA_DRIVEN.contains(moduleName)) {
            return false;
        }
        return TriggerModelReader.getInstance().hasSchemaDrivenModel(orgName, moduleName);
    }

    public static Optional<Function> getModelTemplate(String moduleName, String functionType) {
        NodeBuilder<Function> functionBuilder = useSchemaDrivenPath(null, moduleName)
                ? new SchemaDrivenFunctionBuilder()
                : getFunctionBuilder(moduleName);
        GetModelContext context = GetModelContext.fromServiceAndFunctionType(moduleName, functionType);
        return functionBuilder.getModelTemplate(context);
    }

    public static Map<String, List<TextEdit>> addFunction(String moduleName, Function function, String filePath,
                                                          SemanticModel semanticModel, Document document,
                                                          NonTerminalNode node,
                                                          WorkspaceManager workspaceManager) throws Exception {
        // Schema-driven connectors add handlers via the generic builder; route by the function's
        // stamped connector identity (codedata), mirroring updateFunction.
        Codedata fnCodedata = function.getCodedata();
        NodeBuilder<Function> functionBuilder = fnCodedata != null
                        && useSchemaDrivenPath(fnCodedata.getOrgName(), moduleName)
                        ? new SchemaDrivenFunctionBuilder()
                        : getFunctionBuilder(moduleName);
        Project project = document != null ? document.module().project() : null;
        AddModelContext context = new AddModelContext(null, function, semanticModel, project,
                workspaceManager, filePath, document, node);
        return functionBuilder.addModel(context);
    }

    public static Map<String, List<TextEdit>> updateFunction(String moduleName, Function function, String filePath,
                                                             Document document, FunctionDefinitionNode functionNode,
                                                             SemanticModel semanticModel, Project project,
                                                             WorkspaceManager workspaceManager)
            throws Exception {
        if (function.getKind().equals(OBJECT_METHOD)) {
            moduleName = DEFAULT;
        }
        Codedata fnCodedata = function.getCodedata();
        NodeBuilder<Function> functionBuilder = fnCodedata != null
                        && useSchemaDrivenPath(fnCodedata.getOrgName(), moduleName)
                        ? new SchemaDrivenFunctionBuilder()
                        : getFunctionBuilder(moduleName);
        UpdateModelContext context =
                new UpdateModelContext(null, function, semanticModel, project, workspaceManager, filePath,
                        document, null, functionNode);
        return functionBuilder.updateModel(context);
    }

    public static Function getFunctionFromSource(String moduleName, SemanticModel semanticModel, Node functionNode) {
        ModelFromSourceContext context;
        if (functionNode.parent() instanceof ServiceDeclarationNode serviceDeclarationNode) {
            ServiceMetadata metadata = deriveServiceType(serviceDeclarationNode, semanticModel);
            ModuleID moduleID = metadata.moduleId();
            context = new ModelFromSourceContext(functionNode, null, semanticModel, null, "",
                    metadata.serviceTypeIdentifier(), moduleID.orgName(), moduleID.packageName(),
                    moduleID.moduleName(), moduleID.version());
            NodeBuilder<Function> functionBuilder = useSchemaDrivenPath(moduleID.orgName(), moduleID.moduleName())
                            ? new SchemaDrivenFunctionBuilder()
                            : getFunctionBuilder(moduleID.moduleName());
            Function function = functionBuilder.getModelFromSource(context);
            Codedata codedata = function.getCodedata();
            codedata.setOrgName(moduleID.orgName());
            codedata.setPackageName(moduleID.packageName());
            codedata.setModuleName(moduleID.moduleName());
            return function;
        }
        context = new ModelFromSourceContext(functionNode, null, semanticModel, null, "",
                moduleName, null, null, moduleName, null);
        NodeBuilder<Function> functionBuilder = getFunctionBuilder(context.moduleName());
        return functionBuilder.getModelFromSource(context);
    }
}
