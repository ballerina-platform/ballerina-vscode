/*
 *  Copyright (c) 2024, WSO2 LLC. (http://www.wso2.com)
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

package io.ballerina.designmodelgenerator.core;

import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.api.symbols.ClassSymbol;
import io.ballerina.compiler.api.symbols.FunctionSymbol;
import io.ballerina.compiler.api.symbols.FutureTypeSymbol;
import io.ballerina.compiler.api.symbols.ObjectTypeSymbol;
import io.ballerina.compiler.api.symbols.ParameterSymbol;
import io.ballerina.compiler.api.symbols.Qualifier;
import io.ballerina.compiler.api.symbols.RecordTypeSymbol;
import io.ballerina.compiler.api.symbols.Symbol;
import io.ballerina.compiler.api.symbols.TypeSymbol;
import io.ballerina.compiler.api.symbols.VariableSymbol;
import io.ballerina.compiler.syntax.tree.ExpressionNode;
import io.ballerina.compiler.syntax.tree.FunctionDefinitionNode;
import io.ballerina.compiler.syntax.tree.ListConstructorExpressionNode;
import io.ballerina.compiler.syntax.tree.MappingConstructorExpressionNode;
import io.ballerina.compiler.syntax.tree.MappingFieldNode;
import io.ballerina.compiler.syntax.tree.ModuleMemberDeclarationNode;
import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.compiler.syntax.tree.ModuleVariableDeclarationNode;
import io.ballerina.compiler.syntax.tree.Node;
import io.ballerina.compiler.syntax.tree.NonTerminalNode;
import io.ballerina.compiler.syntax.tree.SpecificFieldNode;
import io.ballerina.compiler.syntax.tree.SyntaxKind;
import io.ballerina.designmodelgenerator.core.model.Activity;
import io.ballerina.designmodelgenerator.core.model.Automation;
import io.ballerina.designmodelgenerator.core.model.Connection;
import io.ballerina.designmodelgenerator.core.model.DesignModel;
import io.ballerina.designmodelgenerator.core.model.Function;
import io.ballerina.designmodelgenerator.core.model.Listener;
import io.ballerina.designmodelgenerator.core.model.Location;
import io.ballerina.designmodelgenerator.core.model.ResourceFunction;
import io.ballerina.designmodelgenerator.core.model.Service;
import io.ballerina.designmodelgenerator.core.model.Workflow;
import io.ballerina.flowmodelgenerator.core.utils.WorkflowUtil;
import io.ballerina.modelgenerator.commons.PackageUtil;
import io.ballerina.projects.Document;
import io.ballerina.projects.Module;
import io.ballerina.projects.Package;
import io.ballerina.tools.text.LineRange;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import static io.ballerina.modelgenerator.commons.CommonUtils.CONNECTOR_TYPE;
import static io.ballerina.modelgenerator.commons.CommonUtils.PERSIST;
import static io.ballerina.modelgenerator.commons.CommonUtils.PERSIST_MODEL_FILE;
import static io.ballerina.modelgenerator.commons.CommonUtils.getPersistDatabaseIcon;
import static io.ballerina.modelgenerator.commons.CommonUtils.getPersistModelFilePath;
import static io.ballerina.modelgenerator.commons.CommonUtils.isPersistClient;

/**
 * Generate the design model for the default package.
 *
 * @since 1.0.0
 */
public class DesignModelGenerator {

    private final SemanticModel semanticModel;
    private final Module defaultModule;
    private final Path rootPath;
    public static final String MAIN_FUNCTION_NAME = "main";
    private static final String AUTOMATION = "automation";
    private static final String SERVICE = "Service";
    private static final String DURABLE_AGENT_CLASS_NAME = "DurableAgent";
    private final Map<String, ModulePartNode> documentMap;

    public DesignModelGenerator(Package ballerinaPackage) {
        this.defaultModule = ballerinaPackage.getDefaultModule();
        this.semanticModel =
                PackageUtil.getCompilation(ballerinaPackage).getSemanticModel(this.defaultModule.moduleId());
        this.rootPath = ballerinaPackage.project().sourceRoot();
        this.documentMap = new HashMap<>();
        this.defaultModule.documentIds().forEach(documentId -> {
            Document document = this.defaultModule.document(documentId);
            documentMap.put(document.name(), document.syntaxTree().rootNode());
        });
    }

    public DesignModel generate() {
        IntermediateModel intermediateModel = new IntermediateModel();
        this.populateModuleLevelConnections(intermediateModel);
        this.populateModuleLevelActivities(intermediateModel);
        this.populateModuleLevelWorkflows(intermediateModel);
        ConnectionFinder connectionFinder = new ConnectionFinder(semanticModel, rootPath, documentMap,
                intermediateModel);
        this.defaultModule.documentIds().forEach(d -> {
            ModulePartNode rootNode = this.defaultModule.document(d).syntaxTree().rootNode();
            CodeAnalyzer codeAnalyzer = new CodeAnalyzer(semanticModel, intermediateModel, rootPath, connectionFinder);
            codeAnalyzer.visit(rootNode);
        });

        DesignModel.DesignModelBuilder builder = new DesignModel.DesignModelBuilder();

        if (intermediateModel.functionModelMap.containsKey(MAIN_FUNCTION_NAME)) {
            IntermediateModel.FunctionModel main = intermediateModel.functionModelMap.get(MAIN_FUNCTION_NAME);
            buildConnectionAndWorkflowGraph(intermediateModel, main, null);
            Automation automation = new Automation(AUTOMATION, main.displayName, "Z", main.location,
                    main.allDependentConnections.stream().toList(),
                    main.allDependentWorkflows.stream().toList());
            for (String workflowUuid : main.allDependentWorkflows) {
                Workflow workflow = intermediateModel.uuidToWorkflowMap.get(workflowUuid);
                if (workflow != null) {
                    workflow.addAttachedFunction(automation.getUuid());
                }
            }
            attachSendDataEdges(intermediateModel, main.allDependentWorkflowSendData, automation.getUuid(), true);
            attachInvalidSendDataEdges(intermediateModel, main.allDependentInvalidWorkflowSendData,
                    automation.getUuid(), true);
            builder.setAutomation(automation);
        }

        for (Map.Entry<String, IntermediateModel.ServiceModel> serviceEntry :
                intermediateModel.serviceModelMap.entrySet()) {
            IntermediateModel.ServiceModel serviceModel = serviceEntry.getValue();
            Set<String> connections = new HashSet<>();
            Set<String> workflows = new HashSet<>();
            Map<String, Set<String>> serviceSendData = new HashMap<>();
            Set<String> serviceInvalidSendData = new HashSet<>();
            List<Function> functions = new ArrayList<>();
            serviceModel.otherFunctions.values().forEach(otherFunction -> {
                analyzeServiceFunction(intermediateModel, otherFunction, serviceModel, connections, workflows,
                        serviceSendData, serviceInvalidSendData);
                functions.add(new Function(otherFunction.name, otherFunction.location,
                        otherFunction.allDependentConnections, otherFunction.allDependentWorkflows,
                        otherFunction.allDependentWorkflowSendData,
                        otherFunction.allDependentInvalidWorkflowSendData));
            });

            List<Function> remoteFunctions = new ArrayList<>();
            serviceModel.remoteFunctions.forEach(remoteFunction -> {
                analyzeServiceFunction(intermediateModel, remoteFunction, serviceModel, connections, workflows,
                        serviceSendData, serviceInvalidSendData);
                remoteFunctions.add(new Function(remoteFunction.name, remoteFunction.location,
                        remoteFunction.allDependentConnections, remoteFunction.allDependentWorkflows,
                        remoteFunction.allDependentWorkflowSendData,
                        remoteFunction.allDependentInvalidWorkflowSendData));
            });

            List<ResourceFunction> resourceFunctions = new ArrayList<>();
            serviceModel.resourceFunctions.forEach(resourceFunction -> {
                analyzeServiceFunction(intermediateModel, resourceFunction, serviceModel, connections, workflows,
                        serviceSendData, serviceInvalidSendData);
                resourceFunctions.add(new ResourceFunction(resourceFunction.name, resourceFunction.path,
                        resourceFunction.location, resourceFunction.allDependentConnections,
                        resourceFunction.allDependentWorkflows, resourceFunction.allDependentWorkflowSendData,
                        resourceFunction.allDependentInvalidWorkflowSendData));
            });
            List<Listener> allAttachedListeners = serviceModel.anonListeners;
            for (String listener : serviceModel.namedListeners) {
                allAttachedListeners.add(intermediateModel.listeners.get(listener));
            }

            Service service = new Service(serviceModel.displayName, serviceModel.absolutePath, serviceModel.location,
                    serviceModel.sortText,
                    connections.stream().toList(), functions, remoteFunctions, resourceFunctions,
                    workflows.stream().toList());
            for (String workflowUuid : workflows) {
                Workflow workflow = intermediateModel.uuidToWorkflowMap.get(workflowUuid);
                if (workflow != null) {
                    workflow.addAttachedService(service.getUuid());
                }
            }
            attachSendDataEdges(intermediateModel, serviceSendData, service.getUuid(), false);
            attachInvalidSendDataEdges(intermediateModel, serviceInvalidSendData, service.getUuid(), false);
            int size = allAttachedListeners.size();
            if (size > 0) {
                Listener listener = allAttachedListeners.get(0);
                service.setIcon(listener.getIcon());
                service.setType(serviceModel.serviceType != null ? serviceModel.serviceType
                        : getServiceType(listener.getType()));
                for (int i = 0; i < size; i++) {
                    listener = allAttachedListeners.get(i);
                    listener.getAttachedServices().add(service.getUuid());
                    service.addAttachedListener(listener.getUuid());
                }
            }
            builder.addService(service);
        }

        // Resolve the connections used by each activity function
        for (Map.Entry<String, Activity> activityEntry : intermediateModel.activityMap.entrySet()) {
            IntermediateModel.FunctionModel functionModel =
                    intermediateModel.functionModelMap.get(activityEntry.getKey());
            if (functionModel != null) {
                buildConnectionAndWorkflowGraph(intermediateModel, functionModel, null);
                functionModel.allDependentConnections.forEach(activityEntry.getValue()::addConnection);
            }
        }

        return builder
                .setListeners(intermediateModel.listeners.values().stream().toList())
                .setConnections(intermediateModel.connectionMap.values().stream().toList())
                .setWorkflows(intermediateModel.workflowMap.values().stream().toList())
                .setActivities(intermediateModel.activityMap.values().stream().toList())
                .build();
    }

    /**
     * Resolves the dependency graph of a service function and folds its connections, workflows and
     * sendData attributions into the service-level aggregates.
     */
    private void analyzeServiceFunction(IntermediateModel intermediateModel,
                                        IntermediateModel.FunctionModel functionModel,
                                        IntermediateModel.ServiceModel serviceModel,
                                        Set<String> connections, Set<String> workflows,
                                        Map<String, Set<String>> serviceSendData,
                                        Set<String> serviceInvalidSendData) {
        functionModel.connections.forEach(connection -> {
            Connection conn = intermediateModel.uuidToConnectionMap.get(connection);
            if (conn != null) {
                functionModel.dependentFuncs.addAll(conn.getDependentFunctions());
                functionModel.allDependentConnections.addAll(
                        conn.getAllTransitiveDependentConnections(intermediateModel.uuidToConnectionMap));
            }
        });
        buildConnectionAndWorkflowGraph(intermediateModel, functionModel, serviceModel);
        connections.addAll(functionModel.allDependentConnections);
        workflows.addAll(functionModel.allDependentWorkflows);
        mergeSendData(serviceSendData, functionModel.allDependentWorkflowSendData);
        serviceInvalidSendData.addAll(functionModel.allDependentInvalidWorkflowSendData);
    }

    private void mergeSendData(Map<String, Set<String>> target, Map<String, Set<String>> source) {
        source.forEach((workflowUuid, eventNames) ->
                target.computeIfAbsent(workflowUuid, k -> new HashSet<>()).addAll(eventNames));
    }

    private void attachSendDataEdges(IntermediateModel intermediateModel, Map<String, Set<String>> sendData,
                                     String senderUuid, boolean isFunction) {
        sendData.forEach((workflowUuid, eventNames) -> {
            Workflow workflow = intermediateModel.uuidToWorkflowMap.get(workflowUuid);
            if (workflow == null) {
                return;
            }
            eventNames.forEach(eventName -> {
                workflow.getEvent(eventName).ifPresent(event -> {
                    if (isFunction) {
                        event.addAttachedFunction(senderUuid);
                    } else {
                        event.addAttachedService(senderUuid);
                    }
                });
            });
        });
    }

    private void attachInvalidSendDataEdges(IntermediateModel intermediateModel, Set<String> invalidSendData,
                                            String senderUuid, boolean isFunction) {
        invalidSendData.forEach(workflowUuid -> {
            Workflow workflow = intermediateModel.uuidToWorkflowMap.get(workflowUuid);
            if (workflow == null) {
                return;
            }
            if (isFunction) {
                workflow.addInvalidSendDataFunction(senderUuid);
            } else {
                workflow.addInvalidSendDataService(senderUuid);
            }
        });
    }

    private void populateModuleLevelWorkflows(IntermediateModel intermediateModel) {
        for (Symbol symbol : this.semanticModel.moduleSymbols()) {
            if (symbol.getName().isEmpty() || symbol.getLocation().isEmpty()) {
                continue;
            }
            if (WorkflowUtil.isWorkflowFunction(symbol)) {
                // symbol.getLocation() points at the function name only; use the enclosing function
                // definition's range so deleting the workflow removes the whole function, not just its name.
                LineRange nameRange = symbol.getLocation().get().lineRange();
                LineRange lineRange = resolveEnclosingFunctionRange(symbol.getLocation().get(), nameRange);
                String sortText = lineRange.fileName() + lineRange.startLine().line();
                Workflow workflow = new Workflow(symbol.getName().get(), sortText, getLocation(lineRange));
                populateWorkflowEvents(workflow, (FunctionSymbol) symbol);
                intermediateModel.workflowMap.put(symbol.getName().get(), workflow);
                intermediateModel.uuidToWorkflowMap.put(workflow.getUuid(), workflow);
            } else if (isDurableAgentVariable(symbol)) {
                // A module-level `workflow:DurableAgent` declaration joins the overview's workflow
                // column as a durable agentic workflow; its identity is the variable name. As with
                // functions, the symbol location covers only the name — widen to the whole
                // declaration so deleting the agent removes the full statement.
                LineRange nameRange = symbol.getLocation().get().lineRange();
                LineRange lineRange = resolveEnclosingModuleVarDeclRange(symbol.getLocation().get(), nameRange);
                String sortText = lineRange.fileName() + lineRange.startLine().line();
                Workflow agent = new Workflow(symbol.getName().get(), sortText, getLocation(lineRange),
                        Workflow.KIND_DURABLE_AGENT);
                populateAgentDeclaredCapabilities(intermediateModel, agent, lineRange);
                intermediateModel.workflowMap.put(symbol.getName().get(), agent);
                intermediateModel.uuidToWorkflowMap.put(agent.getUuid(), agent);
            }
        }
    }

    /**
     * Checks whether the symbol is a module-level variable of the {@code workflow:DurableAgent} class.
     *
     * @param symbol the module symbol to check
     * @return {@code true} for a durable agent declaration
     */
    private boolean isDurableAgentVariable(Symbol symbol) {
        if (!(symbol instanceof VariableSymbol variableSymbol)) {
            return false;
        }
        TypeSymbol typeDescriptor = variableSymbol.typeDescriptor();
        TypeSymbol rawType = CommonUtils.getRawType(typeDescriptor);
        if (!(rawType instanceof ClassSymbol classSymbol)) {
            return false;
        }
        return classSymbol.getName().map(DURABLE_AGENT_CLASS_NAME::equals).orElse(false)
                && WorkflowUtil.isWorkflowModule(classSymbol.getModule());
    }

    /**
     * Derives the data events a workflow waits on from the workflow function's optional third parameter, a record
     * whose fields are all {@code future<T>} typed.
     */
    private void populateWorkflowEvents(Workflow workflow, FunctionSymbol functionSymbol) {
        List<ParameterSymbol> params = functionSymbol.typeDescriptor().params().orElse(List.of());
        if (params.size() < 3) {
            return;
        }
        TypeSymbol rawType = CommonUtils.getRawType(params.get(2).typeDescriptor());
        if (!(rawType instanceof RecordTypeSymbol recordTypeSymbol)) {
            return;
        }
        CommonUtils.ModuleInfo moduleInfo = functionSymbol.getModule()
                .map(module -> CommonUtils.ModuleInfo.from(module.id())).orElse(null);
        recordTypeSymbol.fieldDescriptors().forEach((fieldName, field) -> {
            TypeSymbol fieldType = CommonUtils.getRawType(field.typeDescriptor());
            if (fieldType instanceof FutureTypeSymbol futureTypeSymbol) {
                String eventType = futureTypeSymbol.typeParameter()
                        .map(typeParam -> CommonUtils.getTypeSignature(typeParam, moduleInfo))
                        .orElse("anydata");
                workflow.addEvent(new Workflow.Event(fieldName, eventType));
            }
        });
    }


    /**
     * Derives a durable agent's declared capabilities from the declaration's config literal:
     * event channels (name + request type), human tasks, and links to declared activities.
     *
     * @param intermediateModel the intermediate model holding the activity registry
     * @param agent             the agent's design node
     * @param lineRange         the agent variable symbol's line range
     */
    private void populateAgentDeclaredCapabilities(IntermediateModel intermediateModel, Workflow agent,
                                                   LineRange lineRange) {
        ModulePartNode root = this.documentMap.get(lineRange.fileName());
        if (root == null) {
            return;
        }
        for (ModuleMemberDeclarationNode member : root.members()) {
            // The symbol's location is the variable-name token, so match by line containment.
            if (!(member instanceof ModuleVariableDeclarationNode varDecl)
                    || varDecl.lineRange().startLine().line() > lineRange.startLine().line()
                    || varDecl.lineRange().endLine().line() < lineRange.startLine().line()
                    || varDecl.initializer().isEmpty()) {
                continue;
            }
            // Shared with the edit paths so an explicit `new workflow:DurableAgent({...})` agent
            // renders its capability circles too, not just the implicit-new shape.
            Optional<MappingConstructorExpressionNode> configLiteral = WorkflowUtil.agentConfigLiteral(varDecl);
            if (configLiteral.isEmpty()) {
                continue;
            }
            for (MappingFieldNode field : configLiteral.get().fields()) {
                if (!(field instanceof SpecificFieldNode specificField)
                        || specificField.valueExpr().isEmpty()) {
                    continue;
                }
                String fieldName = specificField.fieldName().toSourceCode().trim();
                ExpressionNode valueExpr = specificField.valueExpr().get();
                // The model provider is a module-level client — link it so the overview draws
                // the agent -> model-provider connection edge.
                if ("model".equals(fieldName)) {
                    linkAgentModelProvider(intermediateModel, agent, valueExpr);
                    continue;
                }
                if (!(valueExpr instanceof ListConstructorExpressionNode list)) {
                    continue;
                }
                switch (fieldName) {
                    case "events" -> populateAgentEvents(agent, list);
                    case "humanTasks" -> populateAgentHumanTasks(agent, list);
                    case "activities" -> linkAgentActivities(intermediateModel, agent, list);
                    default -> {
                    }
                }
            }
            return;
        }
    }

    private void populateAgentEvents(Workflow agent,
                                     ListConstructorExpressionNode events) {
        for (Node item : events.expressions()) {
            if (!(item instanceof MappingConstructorExpressionNode entry)) {
                continue;
            }
            String name = getMappingStringField(entry, "name");
            String requestType = getMappingRawField(entry, "request");
            if (name != null) {
                agent.addEvent(new Workflow.Event(name, requestType == null ? "anydata" : requestType));
            }
        }
    }

    private void populateAgentHumanTasks(Workflow agent,
                                         ListConstructorExpressionNode tasks) {
        for (Node item : tasks.expressions()) {
            if (!(item instanceof MappingConstructorExpressionNode entry)) {
                continue;
            }
            String name = getMappingStringField(entry, "name");
            if (name != null) {
                agent.addHumanTask(new Workflow.HumanTask(name, getLocation(item.lineRange())));
            }
        }
    }

    // The agent's `model: <var>` config field references a module-level model-provider client;
    // resolve the variable to its overview connection (keyed by the symbol location, same as
    // populateModuleLevelConnections) and record the edge on the agent.
    private void linkAgentModelProvider(IntermediateModel intermediateModel, Workflow agent,
                                        ExpressionNode valueExpr) {
        if (valueExpr.kind() != SyntaxKind.SIMPLE_NAME_REFERENCE) {
            return;
        }
        String providerVarName = valueExpr.toSourceCode().trim();
        for (Symbol symbol : this.semanticModel.moduleSymbols()) {
            if (!(symbol instanceof VariableSymbol) || symbol.getName().isEmpty()
                    || !providerVarName.equals(symbol.getName().get()) || symbol.getLocation().isEmpty()) {
                continue;
            }
            Connection connection = intermediateModel.connectionMap
                    .get(String.valueOf(symbol.getLocation().get().hashCode()));
            if (connection != null) {
                agent.addConnection(connection.getUuid());
            }
            return;
        }
    }

    // Declared activity functions link the agent to the shared activities column, exactly like
    // ctx->callActivity does for workflow functions.
    private void linkAgentActivities(IntermediateModel intermediateModel, Workflow agent,
                                     ListConstructorExpressionNode activities) {
        for (Node item : activities.expressions()) {
            String activityName = null;
            if (item.kind() == SyntaxKind.SIMPLE_NAME_REFERENCE) {
                activityName = item.toSourceCode().trim();
            } else if (item instanceof MappingConstructorExpressionNode entry) {
                activityName = getMappingRawField(entry, "activity");
            }
            if (activityName == null) {
                continue;
            }
            Activity activity = intermediateModel.activityMap.get(activityName);
            if (activity != null) {
                agent.addActivity(activity.getUuid());
                activity.addAttachedWorkflow(agent.getUuid());
            }
        }
    }

    private static String getMappingStringField(
            MappingConstructorExpressionNode mapping, String fieldName) {
        String raw = getMappingRawField(mapping, fieldName);
        if (raw != null && raw.length() >= 2 && raw.startsWith("\"") && raw.endsWith("\"")) {
            return raw.substring(1, raw.length() - 1);
        }
        return raw;
    }

    private static String getMappingRawField(
            MappingConstructorExpressionNode mapping, String fieldName) {
        for (MappingFieldNode field : mapping.fields()) {
            if (field instanceof SpecificFieldNode specificField
                    && fieldName.equals(specificField.fieldName().toSourceCode().trim())
                    && specificField.valueExpr().isPresent()) {
                return specificField.valueExpr().get().toSourceCode().trim();
            }
        }
        return null;
    }

    private void populateModuleLevelActivities(IntermediateModel intermediateModel) {
        for (Symbol symbol : this.semanticModel.moduleSymbols()) {
            if (!WorkflowUtil.isActivityFunction(symbol)
                    || symbol.getName().isEmpty() || symbol.getLocation().isEmpty()) {
                continue;
            }
            LineRange lineRange = symbol.getLocation().get().lineRange();
            String sortText = lineRange.fileName() + lineRange.startLine().line();
            Activity activity = new Activity(symbol.getName().get(), sortText, getLocation(lineRange));
            intermediateModel.activityMap.put(symbol.getName().get(), activity);
            intermediateModel.uuidToActivityMap.put(activity.getUuid(), activity);
        }
    }

    private void populateModuleLevelConnections(IntermediateModel intermediateModel) {
        for (Symbol symbol : this.semanticModel.moduleSymbols()) {
            if (symbol instanceof VariableSymbol variableSymbol) {
                TypeSymbol typeSymbol = CommonUtils.getRawType(variableSymbol.typeDescriptor());
                if (typeSymbol instanceof ObjectTypeSymbol objectTypeSymbol) {
                    boolean isHiddenAiClass = CommonUtils.isHiddenAiClass(objectTypeSymbol);
                    if (objectTypeSymbol.qualifiers().contains(Qualifier.CLIENT) || isHiddenAiClass) {
                        LineRange lineRange = variableSymbol.getLocation().get().lineRange();
                        String sortText = lineRange.fileName() + lineRange.startLine().line();
                        String icon = CommonUtils.generateIcon(variableSymbol.typeDescriptor());
                        boolean showConnection = !isHiddenAiClass; // Hide AI non-client classes
                        ClassSymbol persistClassSymbol = null;
                        if (objectTypeSymbol instanceof ClassSymbol cs &&
                                isPersistClient(cs, semanticModel)) {
                            persistClassSymbol = cs;
                            icon = getPersistDatabaseIcon(cs).orElse(icon);
                        }
                        Connection connection = new Connection(variableSymbol.getName().get(), sortText,
                                getLocation(lineRange), Connection.Scope.GLOBAL, icon, showConnection,
                                CommonUtils.getConnectionKind(objectTypeSymbol));
                        if (persistClassSymbol != null) {
                            connection.addMetadata(CONNECTOR_TYPE, PERSIST);
                            getPersistModelFilePath(rootPath, persistClassSymbol)
                                    .ifPresent(modelFile -> connection.addMetadata(PERSIST_MODEL_FILE, modelFile));
                        }
                        intermediateModel.connectionMap.put(
                                String.valueOf(variableSymbol.getLocation().get().hashCode()), connection);
                        intermediateModel.uuidToConnectionMap.put(connection.getUuid(), connection);
                    }
                }
            }
        }
    }

    private void buildConnectionAndWorkflowGraph(IntermediateModel intermediateModel,
                                                 IntermediateModel.FunctionModel functionModel,
                                                 IntermediateModel.ServiceModel serviceModel) {
        Set<String> connections = new HashSet<>();
        Set<String> workflows = new HashSet<>();
        Map<String, Set<String>> workflowSendData = new HashMap<>();
        Set<String> invalidWorkflowSendData = new HashSet<>();
        Set<String> dependentServiceClasses = new HashSet<>();
        if (!functionModel.visited && !functionModel.analyzed) {
            functionModel.visited = true;
            functionModel.usedClasses.forEach(usedClass -> {
                IntermediateModel.ServiceClassModel serviceClassModel = intermediateModel.serviceClassModelMap
                        .get(usedClass);
                if (serviceClassModel != null) {
                    serviceClassModel.functionModels.forEach(serviceClassFunctionModel -> {
                        if (!serviceClassFunctionModel.analyzed) {
                            buildConnectionAndWorkflowGraph(intermediateModel, serviceClassFunctionModel, serviceModel);
                        }
                        extractFieldsFromFunctionModel(serviceClassFunctionModel, connections,
                                workflows, workflowSendData, invalidWorkflowSendData, dependentServiceClasses);
                    });
                }
            });
            functionModel.dependentFuncs.forEach(dependentFunc -> {
                IntermediateModel.FunctionModel dependentFunctionModel = intermediateModel.functionModelMap
                        .get(dependentFunc);
                if (dependentFunctionModel == null) {
                    return;
                }
                if (!dependentFunctionModel.analyzed) {
                    buildConnectionAndWorkflowGraph(intermediateModel, dependentFunctionModel, serviceModel);
                }
                extractFieldsFromFunctionModel(dependentFunctionModel, connections, workflows, workflowSendData,
                        invalidWorkflowSendData, dependentServiceClasses);
            });

            functionModel.dependentObjFuncs.forEach(dependentObjFunc -> {
                if (serviceModel == null) {
                    return;
                }
                IntermediateModel.FunctionModel dependentFunctionModel = serviceModel.otherFunctions
                        .get(dependentObjFunc);
                if (dependentFunctionModel == null) {
                    return;
                }
                if (!dependentFunctionModel.analyzed) {
                    buildConnectionAndWorkflowGraph(intermediateModel, dependentFunctionModel, serviceModel);
                }
                extractFieldsFromFunctionModel(dependentFunctionModel, connections, workflows, workflowSendData,
                        invalidWorkflowSendData, dependentServiceClasses);
            });
        }
        functionModel.visited = true;
        functionModel.allDependentConnections.addAll(functionModel.connections);
        functionModel.allDependentWorkflows.addAll(functionModel.workflows);
        mergeSendData(functionModel.allDependentWorkflowSendData, functionModel.workflowSendData);
        functionModel.allDependentInvalidWorkflowSendData.addAll(functionModel.invalidWorkflowSendData);
        functionModel.usedClasses.addAll(dependentServiceClasses);
        // Also add transitive dependent connections
        for (String connectionUuid : functionModel.connections) {
            Connection connection = intermediateModel.uuidToConnectionMap.get(connectionUuid);
            if (connection != null) {
                functionModel.allDependentConnections.addAll(
                        connection.getAllTransitiveDependentConnections(intermediateModel.uuidToConnectionMap));
            }
        }
        functionModel.allDependentConnections.addAll(connections);
        functionModel.allDependentWorkflows.addAll(workflows);
        mergeSendData(functionModel.allDependentWorkflowSendData, workflowSendData);
        functionModel.allDependentInvalidWorkflowSendData.addAll(invalidWorkflowSendData);
        functionModel.analyzed = true;
    }

    private void extractFieldsFromFunctionModel(IntermediateModel.FunctionModel functionModel, Set<String> connections,
                                                Set<String> workflows,
                                                Map<String, Set<String>> workflowSendData,
                                                Set<String> invalidWorkflowSendData,
                                                Set<String> dependentServiceClasses) {
        connections.addAll(functionModel.allDependentConnections);
        connections.addAll(functionModel.connections);
        workflows.addAll(functionModel.allDependentWorkflows);
        workflows.addAll(functionModel.workflows);
        mergeSendData(workflowSendData, functionModel.allDependentWorkflowSendData);
        mergeSendData(workflowSendData, functionModel.workflowSendData);
        invalidWorkflowSendData.addAll(functionModel.allDependentInvalidWorkflowSendData);
        invalidWorkflowSendData.addAll(functionModel.invalidWorkflowSendData);
        dependentServiceClasses.addAll(functionModel.usedClasses);
    }

    public Location getLocation(LineRange lineRange) {
        Path filePath = rootPath.resolve(lineRange.fileName());
        return new Location(filePath.toAbsolutePath().toString(), lineRange.startLine(),
                lineRange.endLine());
    }

    /**
     * Resolves the full function-definition range enclosing a symbol location. A function symbol's
     * location covers only the function name, so callers that need the whole declaration (e.g. deleting
     * the workflow) must widen it to the enclosing {@link FunctionDefinitionNode}. Falls back to the
     * given name range when the node cannot be resolved.
     */
    private LineRange resolveEnclosingFunctionRange(io.ballerina.tools.diagnostics.Location symbolLocation,
                                                    LineRange nameRange) {
        ModulePartNode modulePartNode = documentMap.get(nameRange.fileName());
        if (modulePartNode == null) {
            return nameRange;
        }
        NonTerminalNode node = modulePartNode.findNode(symbolLocation.textRange());
        while (node != null && !(node instanceof FunctionDefinitionNode)) {
            node = node.parent();
        }
        return node != null ? node.lineRange() : nameRange;
    }

    /**
     * Resolves the full module-variable-declaration range enclosing a symbol location. A durable
     * agent variable's symbol location covers only the variable name, so deletion needs the whole
     * declaration. Falls back to the given name range when the node cannot be resolved.
     */
    private LineRange resolveEnclosingModuleVarDeclRange(io.ballerina.tools.diagnostics.Location symbolLocation,
                                                         LineRange nameRange) {
        ModulePartNode modulePartNode = documentMap.get(nameRange.fileName());
        if (modulePartNode == null) {
            return nameRange;
        }
        NonTerminalNode node = modulePartNode.findNode(symbolLocation.textRange());
        while (node != null && node.kind() != SyntaxKind.MODULE_VAR_DECL) {
            node = node.parent();
        }
        return node != null ? node.lineRange() : nameRange;
    }

    public String getServiceType(String listenerType) {
        return listenerType.split(SyntaxKind.COLON_TOKEN.stringValue())[0]
                + SyntaxKind.COLON_TOKEN.stringValue() + SERVICE;
    }
}
