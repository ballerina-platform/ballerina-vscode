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

package io.ballerina.flowmodelgenerator.core.model.node.builtin;

import io.ballerina.flowmodelgenerator.core.model.Codedata;
import io.ballerina.flowmodelgenerator.core.model.ItemOption;
import io.ballerina.flowmodelgenerator.core.model.Metadata;
import io.ballerina.flowmodelgenerator.core.model.NodeBuilder;
import io.ballerina.flowmodelgenerator.core.model.NodeKind;
import io.ballerina.flowmodelgenerator.core.model.Option;
import io.ballerina.flowmodelgenerator.core.model.Property;
import io.ballerina.flowmodelgenerator.core.model.SourceBuilder;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static io.ballerina.modelgenerator.commons.ParameterData.Kind.REQUIRED;

/**
 * Strategy for the {@code activity:callRestAPI} builtin activity. Surfaces the
 * REST-call-specific form fields (method/path/message/headers); the connection,
 * databinding, result variable and check-error fields are added by the builder.
 *
 * @since 1.8.0
 */
public class RestActivityStrategy implements BuiltinActivityStrategy {

    // Property keys (must match the parameter names of activity:callRestAPI)
    public static final String METHOD_KEY = "method";
    public static final String PATH_KEY = "path";
    public static final String MESSAGE_KEY = "message";
    public static final String HEADERS_KEY = "headers";

    // HTTP method options
    private static final String METHOD_GET = "GET";
    private static final String METHOD_POST = "POST";
    private static final String METHOD_PUT = "PUT";
    private static final String METHOD_DELETE = "DELETE";
    private static final String METHOD_PATCH = "PATCH";

    public static final String HTTP_PKG_ORG = "ballerina";
    public static final String HTTP_PKG_MODULE = "http";

    private static final String STRATEGY_LABEL = "Call REST API";
    private static final String STRATEGY_DESCRIPTION =
            "Call a REST API endpoint as a workflow activity using a configured http:Client connection.";

    @Override
    public void setFormProperties(NodeBuilder nodeBuilder, NodeBuilder.TemplateContext context) {
        List<Option> methodOptions = List.of(
                new Option(METHOD_GET, METHOD_GET),
                new Option(METHOD_POST, METHOD_POST),
                new Option(METHOD_PUT, METHOD_PUT),
                new Option(METHOD_DELETE, METHOD_DELETE),
                new Option(METHOD_PATCH, METHOD_PATCH)
        );

        // Message sub-property shown inside the method dropdown for POST/PUT/PATCH
        Property messageSubProp = new Property.Builder<Void>(null)
                .metadata()
                    .label("Message")
                    .description("Request body payload (for POST, PUT, PATCH)")
                    .stepOut()
                .type().fieldType(Property.ValueType.EXPRESSION)
                    .ballerinaType("http:RequestMessage").selected(true).stepOut()
                .value("")
                .editable(true)
                .build();

        Map<String, Map<String, Property>> methodDynamicFields = new LinkedHashMap<>();
        methodDynamicFields.put(METHOD_GET, Map.of());
        methodDynamicFields.put(METHOD_POST, Map.of(MESSAGE_KEY, messageSubProp));
        methodDynamicFields.put(METHOD_PUT, Map.of(MESSAGE_KEY, messageSubProp));
        methodDynamicFields.put(METHOD_DELETE, Map.of());
        methodDynamicFields.put(METHOD_PATCH, Map.of(MESSAGE_KEY, messageSubProp));

        nodeBuilder.properties().custom()
                .metadata()
                    .label("Method")
                    .description("HTTP method to invoke")
                    .stepOut()
                .type()
                    .fieldType(Property.ValueType.DROPDOWN_CHOICE)
                    .options(methodOptions)
                    .selected(true)
                    .stepOut()
                .codedata().kind(REQUIRED.name()).stepOut()
                .value(METHOD_GET)
                .editable(true)
                .itemOptions(ItemOption.from(methodOptions))
                .dynamicFormFields(methodDynamicFields)
                .stepOut()
                .addProperty(METHOD_KEY);

        // Path — TEXT (default) + EXPRESSION; defaults to "" matching the API default
        nodeBuilder.properties().custom()
                .metadata()
                    .label("Path")
                    .description("Resource path appended to the connection's base URL (e.g., \"/users/1\")")
                    .stepOut()
                .type().fieldType(Property.ValueType.TEXT).ballerinaType("string").selected(true).stepOut()
                .type().fieldType(Property.ValueType.EXPRESSION).ballerinaType("string").selected(false).stepOut()
                .value("")
                .placeholder("/users/1")
                .editable(true)
                .optional(true)
                .stepOut()
                .addProperty(PATH_KEY);

        // Hidden top-level message property — stores saved value; visible sub-field lives in dynamicFormFields
        nodeBuilder.properties().custom()
                .metadata()
                    .label("Message")
                    .description("Request body payload (for POST, PUT, PATCH)")
                    .stepOut()
                .type().fieldType(Property.ValueType.EXPRESSION)
                    .ballerinaType("http:RequestMessage").selected(true).stepOut()
                .value("")
                .editable(true)
                .optional(true)
                .hidden(true)
                .stepOut()
                .addProperty(MESSAGE_KEY);

        // Headers — optional map<string|string[]>, advanced
        nodeBuilder.properties().custom()
                .metadata()
                    .label("Headers")
                    .description("Optional request headers")
                    .stepOut()
                .type().fieldType(Property.ValueType.EXPRESSION)
                    .ballerinaType("map<string|string[]>?").selected(true).stepOut()
                .value("")
                .editable(true)
                .optional(true)
                .advanced(true)
                .stepOut()
                .addProperty(HEADERS_KEY);
    }

    // NOTE: BuiltinActivityStrategy.processSpecialParameter is intentionally NOT overridden here.
    // ActivityCallBuilder.processSpecialParameter routes RestActivityStrategy params to its own
    // private processRestParameter(...) and never delegates to the strategy, so a REST override
    // would be dead code. The default (return false) is inherited; the fallback form for REST is
    // produced by setFormProperties(...).

    @Override
    public String activityFunctionSymbol() {
        return "callRestAPI";
    }

    @Override
    public String connectionBallerinaType() {
        return "http:Client";
    }

    @Override
    public String searchNodesKind() {
        return "HTTP";
    }

    @Override
    public List<Metadata.AllowedConnector> connectors() {
        Codedata httpConnector = new Codedata.Builder<>(null)
                .node(NodeKind.NEW_CONNECTION)
                .org(HTTP_PKG_ORG).module(HTTP_PKG_MODULE).packageName(HTTP_PKG_MODULE)
                .object("Client").symbol("init")
                .build();
        return List.of(new Metadata.AllowedConnector(httpConnector, "Add new HTTP connection"));
    }

    @Override
    public List<String> getCallActivityArgs(SourceBuilder sourceBuilder) {
        Map<String, Property> properties = sourceBuilder.flowNode.properties();
        String method = BuiltinActivityStrategy.getPropertyValue(properties, METHOD_KEY, METHOD_GET);

        List<String> args = new ArrayList<>();

        args.add("method: \"" + method + "\"");

        // path — quote if TEXT-typed; only emit when non-default
        BuiltinActivityStrategy.addQuotedArg(args, "path", properties, PATH_KEY);

        // message — only meaningful for POST/PUT/PATCH
        if (isPayloadMethod(method)) {
            String message = BuiltinActivityStrategy.getPropertyValue(properties, MESSAGE_KEY, "");
            if (!message.isEmpty()) {
                args.add("message: " + message);
            }
        }

        // headers — expression, no quoting
        String headers = BuiltinActivityStrategy.getPropertyValue(properties, HEADERS_KEY, "");
        if (!headers.isEmpty()) {
            args.add("headers: " + headers);
        }

        return args;
    }

    @Override
    public List<Import> getRequiredImports(SourceBuilder sourceBuilder) {
        return List.of(new Import(HTTP_PKG_ORG, HTTP_PKG_MODULE));
    }

    @Override
    public String getLabel() {
        return STRATEGY_LABEL;
    }

    @Override
    public String getDescription() {
        return STRATEGY_DESCRIPTION;
    }

    private boolean isPayloadMethod(String method) {
        return METHOD_POST.equalsIgnoreCase(method) || METHOD_PUT.equalsIgnoreCase(method)
                || METHOD_PATCH.equalsIgnoreCase(method);
    }
}
