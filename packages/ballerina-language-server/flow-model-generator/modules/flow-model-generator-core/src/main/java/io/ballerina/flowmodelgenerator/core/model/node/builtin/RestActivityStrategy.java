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
import io.ballerina.flowmodelgenerator.core.model.node.FromExpressionOption;

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
    public static final String MESSAGE_LABEL = "Message";
    public static final String MESSAGE_DESCRIPTION = "Request body, sent with POST, PUT, PATCH and DELETE";
    public static final String HEADERS_KEY = "headers";
    // The method dropdown's escape hatch: the method as a string expression, written back unquoted.
    public static final String METHOD_EXPRESSION_KEY = "methodExpression";
    private static final String METHOD_EXPRESSION_LABEL = "Method Expression";
    // `callRestAPI` declares `activity:RestMethod`, an enum of the five methods. A plain `string`
    // is not assignable to it, so the field states the enum and the wording does not invite one.
    private static final String METHOD_TYPE = "activity:RestMethod";
    private static final String METHOD_EXPRESSION_DOC = "The HTTP method as an expression: a constant, an enum "
            + "member such as activity:GET, or a variable of type activity:RestMethod. A literal such as "
            + "\"GET\" reopens as that method.";
    private static final String NO_METHOD_EXPRESSION_MESSAGE =
            "From Expression needs a value: fill in Method Expression";

    // HTTP method options
    private static final String METHOD_GET = "GET";
    private static final String METHOD_POST = "POST";
    private static final String METHOD_PUT = "PUT";
    private static final String METHOD_DELETE = "DELETE";
    private static final String METHOD_PATCH = "PATCH";
    private static final List<String> METHODS = List.of(METHOD_GET, METHOD_POST, METHOD_PUT, METHOD_DELETE,
            METHOD_PATCH);

    public static final String HTTP_PKG_ORG = "ballerina";
    public static final String HTTP_PKG_MODULE = "http";

    private static final String STRATEGY_LABEL = "Call REST API";
    private static final String STRATEGY_DESCRIPTION =
            "Call a REST API endpoint as a workflow activity using a configured http:Client connection.";

    /**
     * The method dropdown's reading of a {@code method:} source value: one of the fixed methods, or
     * the expression option carrying the source as typed.
     *
     * @param method     the dropdown selection
     * @param expression the method source under the expression option, empty otherwise
     */
    public record MethodSelection(String method, String expression) {

        public static MethodSelection template() {
            return new MethodSelection(METHOD_GET, "");
        }

        /**
         * Reads a {@code method:} argument. A string literal naming a fixed method selects it; any
         * other expression — a constant, a variable — is kept as typed under the expression option.
         *
         * @param source the argument source, or {@code null} when absent
         * @return the selection
         */
        public static MethodSelection fromSource(String source) {
            if (source == null || source.isBlank()) {
                return template();
            }
            String trimmed = source.trim();
            if (BuiltinActivityStrategy.isBallerinaStringExpression(trimmed)) {
                // Case-sensitive on purpose: `"get"` is not a `RestMethod`, and folding it to GET
                // would rewrite source that does not compile into source that does, silently
                // changing what was written. It opens under From Expression instead, as it stands.
                String literal = trimmed.substring(1, trimmed.length() - 1);
                if (METHODS.contains(literal)) {
                    return new MethodSelection(literal, "");
                }
            }
            return new MethodSelection(FromExpressionOption.VALUE, trimmed);
        }
    }

    @Override
    public void setFormProperties(NodeBuilder nodeBuilder, NodeBuilder.TemplateContext context) {
        addMethodProperties(nodeBuilder, MethodSelection.template(), "");

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
                    .label(MESSAGE_LABEL)
                    .description(MESSAGE_DESCRIPTION)
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

    /**
     * Adds the method dropdown, its per-method body sub-field, the expression option's field and the
     * hidden root property holding the expression. Shared with the source re-read in
     * {@code CodeAnalyzer.populateRestProperties} so both render the same form.
     *
     * @param nodeBuilder the form being built
     * @param selection   the dropdown selection and expression to seed
     * @param message     the body value to seed the sub-field with
     */
    public static void addMethodProperties(NodeBuilder nodeBuilder, MethodSelection selection, String message) {
        List<Option> methodOptions = List.of(
                new Option(METHOD_GET, METHOD_GET),
                new Option(METHOD_POST, METHOD_POST),
                new Option(METHOD_PUT, METHOD_PUT),
                new Option(METHOD_DELETE, METHOD_DELETE),
                new Option(METHOD_PATCH, METHOD_PATCH),
                FromExpressionOption.option());

        // The body, shown under every method the module passes it to. GET is the one method whose
        // dispatch ignores it (`connection->get(path, headers)`), so it is not offered there and a
        // body typed under another method is not carried into it.
        Property messageSubProp = new Property.Builder<Void>(null)
                .metadata()
                    .label(MESSAGE_LABEL)
                    .description(MESSAGE_DESCRIPTION)
                    .stepOut()
                .type().fieldType(Property.ValueType.EXPRESSION)
                    .ballerinaType("http:RequestMessage").selected(true).stepOut()
                .value(message == null ? "" : message)
                .editable(true)
                .build();

        Map<String, Map<String, Property>> methodDynamicFields = new LinkedHashMap<>();
        methodDynamicFields.put(METHOD_GET, Map.of());
        methodDynamicFields.put(METHOD_POST, Map.of(MESSAGE_KEY, messageSubProp));
        methodDynamicFields.put(METHOD_PUT, Map.of(MESSAGE_KEY, messageSubProp));
        methodDynamicFields.put(METHOD_DELETE, Map.of(MESSAGE_KEY, messageSubProp));
        methodDynamicFields.put(METHOD_PATCH, Map.of(MESSAGE_KEY, messageSubProp));
        // An expression may name any method, so the body is offered beside it.
        Map<String, Property> fromExpressionFields = new LinkedHashMap<>();
        fromExpressionFields.put(METHOD_EXPRESSION_KEY, FromExpressionOption.subProperty(METHOD_EXPRESSION_LABEL,
                METHOD_EXPRESSION_DOC, METHOD_TYPE));
        fromExpressionFields.put(MESSAGE_KEY, messageSubProp);
        methodDynamicFields.put(FromExpressionOption.VALUE, fromExpressionFields);

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
                .value(selection.method())
                .editable(true)
                .itemOptions(ItemOption.from(methodOptions))
                .dynamicFormFields(methodDynamicFields)
                .stepOut()
                .addProperty(METHOD_KEY);
        FromExpressionOption.addHiddenProperty(nodeBuilder, METHOD_EXPRESSION_KEY, METHOD_EXPRESSION_LABEL,
                METHOD_EXPRESSION_DOC, METHOD_TYPE, selection.expression());
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
        boolean fromExpression = FromExpressionOption.isSelected(method);

        List<String> args = new ArrayList<>();

        // A fixed method is a string literal; an expression is the source as typed, never quoted.
        args.add("method: " + (fromExpression
                ? FromExpressionOption.expression(properties, METHOD_EXPRESSION_KEY, NO_METHOD_EXPRESSION_MESSAGE)
                : "\"" + method + "\""));

        // path — quote if TEXT-typed; only emit when non-default
        BuiltinActivityStrategy.addQuotedArg(args, "path", properties, PATH_KEY);

        // message — every method but GET, whose dispatch in the module ignores it; an expression
        // may name any of them, so its body goes along when given
        if (fromExpression || isPayloadMethod(method)) {
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

    // `activity:callRestAPI` forwards the body on POST, PUT, PATCH and DELETE, and calls
    // `connection->get(path, headers)` without it. Written as the enumeration rather than "not
    // GET", so a method added to the module does not silently acquire a body here.
    private boolean isPayloadMethod(String method) {
        return METHOD_POST.equalsIgnoreCase(method) || METHOD_PUT.equalsIgnoreCase(method)
                || METHOD_PATCH.equalsIgnoreCase(method) || METHOD_DELETE.equalsIgnoreCase(method);
    }
}
