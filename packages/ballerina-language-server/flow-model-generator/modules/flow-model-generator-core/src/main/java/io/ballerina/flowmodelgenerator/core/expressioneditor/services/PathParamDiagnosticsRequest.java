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

package io.ballerina.flowmodelgenerator.core.expressioneditor.services;

import io.ballerina.flowmodelgenerator.core.expressioneditor.ExpressionEditorContext;
import io.ballerina.modelgenerator.commons.ParameterData;

import java.util.Set;
import java.util.regex.Pattern;

/**
 * Handles diagnostic requests for resource path parameters in the expression editor.
 *
 * <p>A path parameter value is spliced verbatim into a computed resource-access segment
 * ({@code client->/users/[<value>]/messages.list()}), so it is an expression position and the
 * generic {@link ExpressionDiagnosticsRequest} validates it as such. That is too strict for the
 * common case: many APIs document bare words as legal segment values — Gmail's {@code userId}
 * accepts the literal {@code me} for the authenticated user — and validating {@code me} as an
 * expression reports {@code undefined symbol 'me'}.</p>
 *
 * <p>This request keeps full expression validation for anything that must be an expression, and
 * short-circuits only when the input is plain text that the source generator can emit as a quoted
 * string literal. The unavoidable cost of accepting {@code me} is that a mistyped variable name is
 * accepted too: the two are indistinguishable at this level.</p>
 *
 * @see ExpressionDiagnosticsRequest
 * @since 1.0.0
 */
public class PathParamDiagnosticsRequest extends ExpressionDiagnosticsRequest {

    private static final Set<String> PATH_PARAM_KINDS = Set.of(
            ParameterData.Kind.PATH_PARAM.name(),
            ParameterData.Kind.PATH_REST_PARAM.name());

    // Types whose values the source generator can emit as a double-quoted string literal.
    private static final Set<String> TEXT_TYPES = Set.of("string", "string?");

    // Characters that cannot appear verbatim inside a `["..."]` path segment: the quote and escape
    // characters that would terminate the literal, the brackets that delimit the segment, the
    // separator that would split it in two, and any control character.
    private static final Pattern NON_LITERAL_CHARS = Pattern.compile("[\"\\\\\\[\\]/\\p{Cntrl}]");

    public PathParamDiagnosticsRequest(ExpressionEditorContext context) {
        super(context);
    }

    /**
     * Returns whether the given property describes a resource path parameter, and should therefore
     * be validated by this request rather than through the field-type switch in
     * {@link DiagnosticsRequest#from(ExpressionEditorContext)}.
     *
     * @param property the property being edited
     * @return whether the property is a path parameter
     */
    public static boolean handles(ExpressionEditorContext.Property property) {
        return property.parameterKind().map(PATH_PARAM_KINDS::contains).orElse(false);
    }

    @Override
    public Diagnostics getResponse(ExpressionEditorContext context) {
        if (isPlainTextSegment(context)) {
            return new Diagnostics(Set.of());
        }
        return super.getResponse(context);
    }

    /**
     * Returns whether the input can stand as a plain string-literal path segment, in which case it
     * needs no expression-level validation. Requires the parameter to be string-typed, since a bare
     * word is not a legal value for a path parameter of any other type.
     */
    private boolean isPlainTextSegment(ExpressionEditorContext context) {
        String ballerinaType = context.getProperty().propertyType().ballerinaType();
        if (ballerinaType == null || !TEXT_TYPES.contains(ballerinaType.trim())) {
            return false;
        }
        String expression = context.info().expression();
        return !expression.isBlank() && !NON_LITERAL_CHARS.matcher(expression).find();
    }
}
