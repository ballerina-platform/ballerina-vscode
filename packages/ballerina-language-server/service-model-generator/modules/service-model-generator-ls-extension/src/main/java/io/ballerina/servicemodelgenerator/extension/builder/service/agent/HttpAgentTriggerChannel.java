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

package io.ballerina.servicemodelgenerator.extension.builder.service.agent;

import io.ballerina.compiler.syntax.tree.FunctionDefinitionNode;
import io.ballerina.compiler.syntax.tree.ListenerDeclarationNode;
import io.ballerina.compiler.syntax.tree.ModuleMemberDeclarationNode;
import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.compiler.syntax.tree.Node;
import io.ballerina.compiler.syntax.tree.NodeList;
import io.ballerina.compiler.syntax.tree.ServiceDeclarationNode;
import io.ballerina.compiler.syntax.tree.Token;
import io.ballerina.projects.Document;
import io.ballerina.servicemodelgenerator.extension.builder.service.HttpServiceBuilder;
import io.ballerina.servicemodelgenerator.extension.connector.SchemaDrivenSourceGenerator;
import io.ballerina.servicemodelgenerator.extension.connector.SchemaDrivenSourceGenerator.HandlerParameter;
import io.ballerina.servicemodelgenerator.extension.model.Codedata;
import io.ballerina.servicemodelgenerator.extension.model.Function;
import io.ballerina.servicemodelgenerator.extension.model.HttpResponse;
import io.ballerina.servicemodelgenerator.extension.model.Parameter;
import io.ballerina.servicemodelgenerator.extension.model.PropertyType;
import io.ballerina.servicemodelgenerator.extension.model.ServiceInitModel;
import io.ballerina.servicemodelgenerator.extension.model.ValidationRule;
import io.ballerina.servicemodelgenerator.extension.model.Value;
import io.ballerina.servicemodelgenerator.extension.model.context.GetServiceInitModelContext;
import io.ballerina.servicemodelgenerator.extension.util.Constants;
import io.ballerina.servicemodelgenerator.extension.util.HttpUtil;
import io.ballerina.servicemodelgenerator.extension.util.Utils;
import io.ballerina.servicemodelgenerator.extension.validation.GenerationRefusedException;
import io.ballerina.tools.text.LineRange;
import org.eclipse.lsp4j.TextEdit;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static io.ballerina.servicemodelgenerator.extension.model.ServiceInitModel.KEY_CONFIGURE_ENDPOINT;
import static io.ballerina.servicemodelgenerator.extension.model.ServiceInitModel.KEY_EXISTING_SERVICE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.HTTP_PARAM_TYPE_HEADER;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.NEW_LINE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.SPACE;

/**
 * Exposes an agent at an HTTP endpoint the user shapes: the request becomes the prompt and the agent's
 * answer becomes the response.
 *
 * @since 1.9.0
 */
public class HttpAgentTriggerChannel implements AgentTriggerChannel {

    static final String ORG_NAME = "ballerina";
    static final String MODULE_NAME = "http";
    static final String BASE_PATH = "basePath";
    static final String PORT = "port";

    private static final String LISTENER_VAR_NAME = "httpDefaultListener";
    private static final String DEFAULT_BASE_PATH = "/agent";
    private static final String DEFAULT_INSTRUCTIONS = "Answer the request.";
    private static final String SOLE_PAYLOAD_LABEL = "Request payload";
    private static final String DEFAULT_PAYLOAD_NAME = "payload";
    private static final String STRING_TYPE = "string";
    private static final String ERROR_TYPE = "error";
    private static final String BODY_FIELD = " body;";
    private static final Pattern PATH_PARAM =
            Pattern.compile("^\\[\\s*([A-Za-z_][A-Za-z0-9_:]*)\\s+([A-Za-z_][A-Za-z0-9_]*)\\s*]$");
    private static final List<String> STRING_TYPE_ALIASES = List.of(STRING_TYPE, "json", "anydata");
    private static final String LISTENER_TYPE = MODULE_NAME + ":Listener";
    private static final String LISTENER_DECLARATION =
            "listener " + LISTENER_TYPE + " " + LISTENER_VAR_NAME + " = http:getDefaultListener();";

    private static final String SERVICE_BLOCK = """
            service {{basePath}} on {{listener}} {
            {{resource}}
            }
            """;

    private static final String DEFAULT_SIGNATURE =
            "resource function post .(@http:Payload string payload) returns string|error ";

    private static final String RESOURCE = """
            {{signature}}{
                do {
                    {{answerType}} result = check {{agentRun}};
            {{return}}    } on fail error err {
                    // handle error
                    return error("unhandled error", err);
                }
            }""";

    private static final String RETURN_ANSWER = "        return result;" + NEW_LINE;

    private static final String RETURN_ANSWER_AS_BODY = "        return {body: result};" + NEW_LINE;

    private static final String RETURN_ANSWER_UNMAPPED =
            "        // TODO: map the agent's result to the declared response type and return it" + NEW_LINE
            + "        return error(\"response mapping not implemented\", result = result);" + NEW_LINE;

    @Override
    public AgentTriggerKind kind() {
        return AgentTriggerKind.HTTP;
    }

    @Override
    public AgentTriggerDeletionScope deletionScope() {
        return AgentTriggerDeletionScope.ENTRY_POINT;
    }

    @Override
    public List<String> imports() {
        return List.of();
    }

    @Override
    public boolean isSchemaDriven() {
        return false;
    }

    @Override
    public Optional<ServiceInitModel> initModel(GetServiceInitModelContext context) {
        ServiceInitModel model = new ServiceInitModel("http-agent", "HTTP Endpoint",
                "Expose the agent at a URL, so anything that can call an API can reach it.",
                context.orgName(), context.packageName(), MODULE_NAME, context.version(), "agent-http", "");
        List<String> served = servedPaths(rootNodeOf(context.document()));
        Value chooser = listenerChooser(context);
        if (served.isEmpty()) {
            model.addProperty(BASE_PATH, pathField(served));
            if (chooser != null) {
                model.addProperty(ServiceInitModel.KEY_CONFIGURE_LISTENER, chooser);
            }
        } else {
            model.addProperty(KEY_CONFIGURE_ENDPOINT, endpointChoice(served, chooser));
        }
        return Optional.of(model);
    }

    public static Value pathField(List<String> served) {
        Value field = new Value.ValueBuilder()
                .metadata("Endpoint Path", "The HTTP path this endpoint is served on.")
                .setCodedata(new Codedata("SERVICE_BASE_PATH"))
                .types(List.of(PropertyType.types(Value.FieldType.SERVICE_PATH, "string")))
                .enabled(true)
                .editable(true)
                .optional(false)
                .value(DEFAULT_BASE_PATH)
                .build();
        if (!served.isEmpty()) {
            field.getTypes().getFirst().setValidations(List.of(pathIsFree(served)));
        }
        return field;
    }

    private static ValidationRule pathIsFree(List<String> served) {
        ValidationRule rule = new ValidationRule("common.validate.not.one.of");
        rule.setArgs(Map.of("values", served));
        rule.setMessage("A service already serves this path. Choose \"Use an existing service\" instead.");
        return rule;
    }

    public static Value endpointChoice(List<String> served, Value listenerChooser) {
        Value choice = new Value.ValueBuilder()
                .metadata("Endpoint", "Serve the agent from a new service or one that already exists.")
                .types(List.of(PropertyType.types(Value.FieldType.CHOICE)))
                .enabled(true)
                .editable(true)
                .value("")
                .build();
        choice.setChoices(List.of(createNewChoice(served, listenerChooser), useExistingChoice(served)));
        return choice;
    }

    private static Value createNewChoice(List<String> served, Value listenerChooser) {
        Map<String, Value> properties = new LinkedHashMap<>();
        properties.put(BASE_PATH, pathField(served));
        if (listenerChooser != null) {
            properties.put(ServiceInitModel.KEY_CONFIGURE_LISTENER, listenerChooser);
        }
        return new Value.ValueBuilder()
                .metadata("Create a new service", "Serve the agent at its own path.")
                .types(List.of(PropertyType.types(Value.FieldType.FORM)))
                .enabled(true)
                .editable(true)
                .setProperties(properties)
                .build();
    }

    private static Value useExistingChoice(List<String> served) {
        Value selector = new Value.ValueBuilder()
                .metadata("Select Service", "The endpoint is added to this service, which keeps its path.")
                .types(List.of(PropertyType.types(Value.FieldType.SINGLE_SELECT)))
                .enabled(true)
                .editable(true)
                .optional(false)
                .value(served.getFirst())
                .setItems(new ArrayList<>(served))
                .build();
        return new Value.ValueBuilder()
                .metadata("Use an existing service", "Add the endpoint to a service already in this project.")
                .types(List.of(PropertyType.types(Value.FieldType.FORM)))
                .enabled(false)
                .editable(true)
                .setProperties(new LinkedHashMap<>(Map.of(KEY_EXISTING_SERVICE, selector)))
                .build();
    }

    private static String resourceSignature(Function shaped) {
        return shaped == null ? "post#." : accessor(shaped) + "#" + unescape(resourcePath(shaped));
    }

    private static List<String> declaredResources(NodeList<Node> members) {
        List<String> declared = new ArrayList<>();
        for (Node member : members) {
            if (member instanceof FunctionDefinitionNode function && isResource(function)) {
                declared.add(function.functionName().text().trim().toLowerCase(Locale.ROOT) + "#"
                        + unescape(Utils.getPath(function.relativeResourcePath())));
            }
        }
        return declared;
    }

    private static boolean isResource(FunctionDefinitionNode function) {
        for (Token qualifier : function.qualifierList()) {
            if (Constants.RESOURCE.equals(qualifier.text().trim())) {
                return true;
            }
        }
        return false;
    }

    private static String unescape(String text) {
        return text.replace("\\", "").strip();
    }

    public static List<String> servedPaths(ModulePartNode rootNode) {
        List<String> paths = new ArrayList<>();
        if (rootNode == null) {
            return paths;
        }
        for (ModuleMemberDeclarationNode member : rootNode.members()) {
            if (!(member instanceof ServiceDeclarationNode service) || service.typeDescriptor().isPresent()) {
                continue;
            }
            String path = servedPath(service);
            if (!path.isEmpty() && !paths.contains(path)) {
                paths.add(path);
            }
        }
        return paths;
    }

    private static ModulePartNode rootNodeOf(Document document) {
        return document != null && document.syntaxTree().rootNode() instanceof ModulePartNode rootNode
                ? rootNode : null;
    }

    private static String servedPath(ServiceDeclarationNode service) {
        return unescape(Utils.getPath(service.absoluteResourcePath()));
    }

    @Override
    public Map<String, Value> additionalProperties() {
        return Map.of(INSTRUCTIONS, AgentTriggerChannel.instructionsField(
                "What the agent should do with each request.", DEFAULT_INSTRUCTIONS));
    }

    private static Value listenerChooser(GetServiceInitModelContext context) {
        if (context.document() == null) {
            return null;
        }
        ServiceInitModel httpModel = new HttpServiceBuilder().getServiceInitModel(context);
        return httpModel == null ? null
                : httpModel.getProperties().get(ServiceInitModel.KEY_CONFIGURE_LISTENER);
    }

    @Override
    public Optional<SchemaDrivenSourceGenerator.ResolvedListener> listener(ModulePartNode rootNode, String alias,
                                                                          Map<String, String> formValues) {
        String port = formValues.get(PORT);
        String customName = formValues.get(ServiceInitModel.KEY_LISTENER_VAR_NAME);
        if (port != null && !port.isBlank() && customName != null && !customName.isBlank()) {
            return Optional.of(new SchemaDrivenSourceGenerator.ResolvedListener(customName.strip(),
                    "listener " + LISTENER_TYPE + " " + customName.strip() + " = new (" + port.strip() + ");"));
        }
        for (ModuleMemberDeclarationNode member : rootNode.members()) {
            if (member instanceof ListenerDeclarationNode declaration
                    && declaration.toSourceCode().contains(LISTENER_TYPE)) {
                return Optional.of(new SchemaDrivenSourceGenerator.ResolvedListener(
                        declaration.variableName().text().strip(), null));
            }
        }
        return Optional.of(new SchemaDrivenSourceGenerator.ResolvedListener(LISTENER_VAR_NAME,
                LISTENER_DECLARATION));
    }

    @Override
    public Optional<List<TextEdit>> appendToExistingService(ModulePartNode rootNode,
                                                            AgentTriggerContext context) {
        String wanted = context.formValue(KEY_EXISTING_SERVICE).strip();
        if (wanted.isEmpty()) {
            return Optional.empty();
        }
        for (ModuleMemberDeclarationNode member : rootNode.members()) {
            if (!(member instanceof ServiceDeclarationNode service) || service.typeDescriptor().isPresent()
                    || !wanted.equals(servedPath(service))) {
                continue;
            }
            NodeList<Node> members = service.members();
            String signature = resourceSignature(context.initForm().getResource());
            if (declaredResources(members).contains(signature)) {
                throw new GenerationRefusedException(KEY_EXISTING_SERVICE, wanted
                        + " already has a '" + signature.replace('#', ' ')
                        + "' resource. Change the HTTP method or the resource path.");
            }
            LineRange lastMember = members.isEmpty() ? service.openBraceToken().lineRange()
                    : members.get(members.size() - 1).lineRange();
            return Optional.of(List.of(new TextEdit(Utils.toRange(lastMember.endLine()),
                    NEW_LINE + NEW_LINE + resource(context))));
        }
        return Optional.empty();
    }

    @Override
    public String serviceBlock(AgentTriggerContext context) {
        return context.fill(SERVICE_BLOCK)
                .replace("{{basePath}}", context.servicePath(BASE_PATH, DEFAULT_BASE_PATH))
                .replace("{{resource}}", resource(context));
    }

    private static String resource(AgentTriggerContext context) {
        Function shaped = context.initForm().getResource();
        return shaped == null ? defaultResource(context) : shapedResource(context, shaped);
    }

    private static String shapedResource(AgentTriggerContext context, Function shaped) {
        List<String> newTypeDefinitions = new ArrayList<>();
        Map<String, String> importsForMainBal = new LinkedHashMap<>();
        String signature = HttpUtil.generateHttpResourceSignature(shaped, newTypeDefinitions, importsForMainBal,
                context.auxiliaryImports(), true);
        context.auxiliaryTypes().addAll(newTypeDefinitions);
        String header = "resource function " + accessor(shaped) + SPACE + resourcePath(shaped) + signature;
        Answer answer = answer(shaped);
        return body(context, header, answer, promptParameters(shaped));
    }

    private static String defaultResource(AgentTriggerContext context) {
        return body(context, DEFAULT_SIGNATURE, new Answer(STRING_TYPE, false, true),
                List.of(new HandlerParameter(STRING_TYPE, DEFAULT_PAYLOAD_NAME, true)));
    }

    private static String body(AgentTriggerContext context, String header, Answer answer,
                               List<HandlerParameter> parameters) {
        String resource = RESOURCE.replace("{{return}}", returnStatement(answer));
        String promptExpression = AgentPromptBuilder.promptExpression(context.formValue(INSTRUCTIONS),
                DEFAULT_INSTRUCTIONS, SOLE_PAYLOAD_LABEL, parameters);
        return AgentTriggerChannel.indent(resource)
                .replace("{{signature}}", header)
                .replace("{{answerType}}", answer.type())
                .replace("{{agentRun}}", context.agentRun(promptExpression));
    }

    private record Answer(String type, boolean isBody, boolean deliverable) {
    }

    private static String returnStatement(Answer answer) {
        if (!answer.deliverable()) {
            return RETURN_ANSWER_UNMAPPED;
        }
        return answer.isBody() ? RETURN_ANSWER_AS_BODY : RETURN_ANSWER;
    }

    private static String accessor(Function shaped) {
        Value accessor = shaped.getAccessor();
        String value = accessor == null ? null : accessor.getValue();
        return value == null || value.isBlank() ? "post" : value.strip().toLowerCase(Locale.ROOT);
    }

    private static String resourcePath(Function shaped) {
        Value name = shaped.getName();
        String value = name == null ? null : name.getValue();
        return value == null || value.isBlank() ? "." : value.strip();
    }

    private static Answer answer(Function shaped) {
        HttpResponse response = firstAnswerResponse(shaped);
        if (response == null) {
            return new Answer(STRING_TYPE, false, true);
        }
        String emitted = HttpUtil.getStatusCodeResponse(response, new ArrayList<>(), new LinkedHashMap<>(),
                new LinkedHashMap<>(), defaultStatusCode(shaped));
        String body = valueOf(response.getBody());
        if (emitted != null && body != null && !emitted.equals(body) && emitted.contains(BODY_FIELD)) {
            return new Answer(STRING_TYPE, true, acceptsString(body));
        }
        String declared = emitted != null && !emitted.isBlank() ? emitted.strip() : body;
        return new Answer(STRING_TYPE, false, acceptsString(declared));
    }

    private static boolean acceptsString(String type) {
        return type == null || type.isBlank() || STRING_TYPE_ALIASES.contains(type.strip());
    }

    private static HttpResponse firstAnswerResponse(Function shaped) {
        if (shaped.getReturnType() == null || shaped.getReturnType().getResponses() == null) {
            return null;
        }
        return shaped.getReturnType().getResponses().stream()
                .filter(HttpResponse::isEnabled)
                .filter(response -> !ERROR_TYPE.equals(valueOf(response.getBody()))
                        && !ERROR_TYPE.equals(valueOf(response.getType())))
                .filter(response -> Objects.nonNull(valueOf(response.getStatusCode())))
                .findFirst()
                .orElse(null);
    }

    private static int defaultStatusCode(Function shaped) {
        return "post".equals(accessor(shaped)) ? 201 : 200;
    }

    private static List<HandlerParameter> promptParameters(Function shaped) {
        List<HandlerParameter> parameters = new ArrayList<>(pathParameters(shaped));
        for (Parameter parameter : shaped.getParameters() == null ? List.<Parameter>of() : shaped.getParameters()) {
            if (!parameter.isEnabled() || HTTP_PARAM_TYPE_HEADER.equals(parameter.getHttpParamType())) {
                continue;
            }
            String type = valueOf(parameter.getType());
            String name = valueOf(parameter.getName());
            if (type == null || name == null) {
                continue;
            }
            parameters.add(new HandlerParameter(type, name, true));
        }
        return parameters;
    }

    private static List<HandlerParameter> pathParameters(Function shaped) {
        List<HandlerParameter> parameters = new ArrayList<>();
        for (String segment : resourcePath(shaped).split("/")) {
            Matcher matcher = PATH_PARAM.matcher(segment.strip());
            if (matcher.matches()) {
                parameters.add(new HandlerParameter(matcher.group(1), matcher.group(2), true));
            }
        }
        return parameters;
    }

    private static String valueOf(Value value) {
        if (value == null || value.getValue() == null || value.getValue().isBlank()) {
            return null;
        }
        return value.getValue().strip();
    }

}
