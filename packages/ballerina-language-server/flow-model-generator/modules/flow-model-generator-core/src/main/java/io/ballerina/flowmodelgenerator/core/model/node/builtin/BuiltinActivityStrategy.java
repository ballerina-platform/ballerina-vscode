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

import io.ballerina.flowmodelgenerator.core.model.Metadata;
import io.ballerina.flowmodelgenerator.core.model.NodeBuilder;
import io.ballerina.flowmodelgenerator.core.model.Property;
import io.ballerina.flowmodelgenerator.core.model.PropertyType;
import io.ballerina.flowmodelgenerator.core.model.SourceBuilder;
import io.ballerina.modelgenerator.commons.ParameterData;

import java.util.List;
import java.util.Map;

/**
 * Defines the contract for builtin activity types (REST, SOAP, Email).
 * Each strategy maps to a single function in the {@code ballerina/workflow.activity} module
 * (e.g., {@code callRestAPI}, {@code sendEmail}, {@code callSoapAPI}). The strategy contributes
 * the API-specific form fields and the named-argument entries for the
 * {@code ctx->callActivity(activity:<symbol>, { connection: <conn>, ... })} call.
 *
 * <p>The shared {@code connection} field, {@code Databinding}/result-name fields, and the
 * {@code check} flag are added by {@code BuiltinActivityBuilder} and are not the strategy's
 * concern.</p>
 *
 * @since 1.8.0
 */
public interface BuiltinActivityStrategy {

    /**
     * Represents a Ballerina import (org and module pair).
     *
     * @param org    the organisation (e.g. "ballerina")
     * @param module the module name (e.g. "http")
     */
    record Import(String org, String module) {
    }

    /**
     * Sets the API-specific form fields for this activity type.
     * Implementations must NOT add the connection, return-type, result-variable, or
     * check-error fields — those are added by the builder.
     *
     * @param nodeBuilder the node builder to add properties to
     * @param context     the template context for resolving symbols
     */
    void setFormProperties(NodeBuilder nodeBuilder, NodeBuilder.TemplateContext context);

    /**
     * Intercepts a single parameter during {@code setParameterProperties} to render a
     * richer form field (e.g., DROPDOWN_CHOICE, hidden field, TEXT+EXPRESSION toggle).
     *
     * <p>Called by {@code ActivityCallBuilder.processSpecialParameter} for parameters that
     * are not already handled centrally (connection, retryPolicy). Return {@code true} to
     * indicate that the parameter has been fully handled and the default processing should
     * be skipped; return {@code false} to let the default rendering run.
     *
     * @param paramData   the parameter descriptor from FunctionDataBuilder
     * @param nodeBuilder the builder on which to add properties
     * @return {@code true} if the parameter was handled, {@code false} for default processing
     */
    default boolean processSpecialParameter(ParameterData paramData, NodeBuilder nodeBuilder) {
        return false;
    }

    /**
     * Returns the symbol name of the activity function to invoke in the
     * {@code ballerina/workflow.activity} module.
     *
     * @return the function symbol (e.g., "callRestAPI", "sendEmail", "callSoapAPI")
     */
    String activityFunctionSymbol();

    /**
     * Returns the Ballerina type used to filter module-level {@code final} client
     * variables eligible for the connection dropdown (e.g., {@code "http:Client"}).
     *
     * @return the connection ballerinaType
     */
    String connectionBallerinaType();

    /**
     * Returns the connection category id (e.g., {@code "HTTP"}) advertised through the
     * {@code CONNECTION} field's {@code codedata.searchNodesKind}. The UI uses this to
     * filter the connection picker and to surface a shortcut to create a compatible new
     * connection when none is available.
     *
     * @return the connection category id
     */
    String searchNodesKind();

    /**
     * Returns the allowed-connector entries for this activity's CONNECTION field. Each
     * entry pairs a connector codedata (org/module/object/symbol) with the label shown
     * on its "Add new connection" button. When the user has no compatible connection in
     * the project, the UI uses these to inline-create one. Returning {@code null} or an
     * empty list disables the Add button.
     *
     * @return list of allowed connectors, or {@code null}
     */
    default List<Metadata.AllowedConnector> connectors() {
        return null;
    }

    /**
     * Returns the Ballerina imports required by the connection type for this activity.
     * The {@code workflow.activity} import is added by the builder.
     *
     * @param sourceBuilder the source builder
     * @return list of imports required by the connection type
     */
    List<Import> getRequiredImports(SourceBuilder sourceBuilder);

    /**
     * Returns the label for this activity type.
     *
     * @return the display label
     */
    String getLabel();

    /**
     * Returns the description for this activity type.
     *
     * @return the display description
     */
    String getDescription();

    /**
     * Builds the API-specific named-argument entries for the
     * {@code ctx->callActivity(activity:<symbol>, { connection: <conn>, ... })} call record.
     * The {@code connection:} and (for REST) {@code t:} entries are emitted by the builder
     * and must not be returned here.
     *
     * @param sourceBuilder the source builder
     * @return list of argument entries (e.g. {@code "method: \"GET\""})
     */
    default List<String> getCallActivityArgs(SourceBuilder sourceBuilder) {
        return List.of();
    }

    /**
     * Adds a named argument to {@code args}, quoting the value as a Ballerina string literal
     * when the property's currently-selected type is {@link Property.ValueType#TEXT}
     * (i.e., the user entered plain text, not an expression). Skips when the property is
     * missing or its value is empty.
     *
     * <p>Plain string templates without interpolations (e.g. {@code string `/hello`}) are first
     * normalised to double-quoted literals.  This is a temporary workaround: the form does not yet
     * handle URL special characters, so users enter paths as string templates to avoid quoting
     * issues.  The {@link #isBallerinaStringExpression} guard after normalisation prevents the
     * already-quoted result from being wrapped a second time.  TODO: fix URL special-character
     * handling in the form so string templates are no longer needed as a workaround.</p>
     */
    static void addQuotedArg(List<String> args, String paramName,
                             Map<String, Property> properties, String propKey) {
        if (properties == null) {
            return;
        }
        Property prop = properties.get(propKey);
        if (prop == null || prop.value() == null || prop.value().toString().isEmpty()) {
            return;
        }
        String value = prop.value().toString();
        if (isTextSelected(prop)) {
            // Normalise plain string templates (no interpolation) to double-quoted literals
            // so source always uses "..." rather than string `...`.
            value = normalizeStringLiteral(value);
            if (!isBallerinaStringExpression(value)) {
                value = "\"" + value.replace("\\", "\\\\")
                        .replace("\"", "\\\"")
                        .replace("\n", "\\n")
                        .replace("\r", "\\r")
                        .replace("\t", "\\t") + "\"";
            }
        }
        args.add(paramName + ": " + value);
    }

    /**
     * Converts a Ballerina string template without interpolations (e.g. {@code string `/abc`})
     * to an equivalent double-quoted string literal (e.g. {@code "/abc"}).
     * Returns the value unchanged when it already is a double-quoted literal, contains
     * interpolations ({@code ${...}}), or is any other expression.
     */
    static String normalizeStringLiteral(String value) {
        if (value != null && value.startsWith("string `") && value.endsWith("`")
                && !value.contains("${")) {
            String inner = value.substring("string `".length(), value.length() - 1);
            return "\"" + inner.replace("\\", "\\\\")
                    .replace("\"", "\\\"")
                    .replace("\n", "\\n")
                    .replace("\r", "\\r")
                    .replace("\t", "\\t") + "\"";
        }
        return value;
    }

    /**
     * Returns {@code true} when the value is already a Ballerina double-quoted string
     * literal ({@code "..."}).  Such values must not be additionally wrapped in
     * double-quotes during source generation.
     */
    static boolean isBallerinaStringExpression(String value) {
        return value.startsWith("\"") && value.endsWith("\"") && value.length() > 1;
    }

    /**
     * Returns {@code true} when the currently-selected type for the given property is
     * {@link Property.ValueType#TEXT} — meaning the raw user input must be wrapped in
     * Ballerina string quotes when emitted as source.
     */
    static boolean isTextSelected(Property prop) {
        if (prop == null || prop.types() == null) {
            return false;
        }
        return prop.types().stream()
                .filter(PropertyType::selected)
                .findFirst()
                .map(t -> t.fieldType() == Property.ValueType.TEXT)
                .orElse(false);
    }

    /**
     * Returns the property value for the provided key, or the provided default value
     * when the property map/key/value is missing or empty.
     */
    static String getPropertyValue(Map<String, Property> properties, String key, String defaultValue) {
        if (properties == null) {
            return defaultValue;
        }
        Property prop = properties.get(key);
        if (prop != null && prop.value() != null && !prop.value().toString().isEmpty()) {
            return prop.value().toString();
        }
        return defaultValue;
    }
}
