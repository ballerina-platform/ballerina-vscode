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
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

package io.ballerina.servicemodelgenerator.extension.validation;

import io.ballerina.openapi.core.generators.common.GeneratorUtils;
import io.ballerina.servicemodelgenerator.extension.model.ServiceInitModel;
import io.ballerina.servicemodelgenerator.extension.model.Value;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.parser.OpenAPIV3Parser;
import io.swagger.v3.parser.core.models.SwaggerParseResult;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

/**
 * Validates the name of the service contract generated from an OpenAPI definition.
 *
 * <p>The OpenAPI generator emits both the service object type and the types required by the
 * contract in the same module. Reusing a schema name for the service object therefore creates two
 * declarations with the same name and can make payload references resolve to the service object.
 * This validator rejects that input before any source edits are produced.</p>
 *
 * @since 1.8.0
 */
public final class OpenApiServiceTypeNameValidator {

    public static final String RULE = "ls.validate.openapi.service.type.name";
    private static final String SERVICE_TYPE_NAME = "serviceTypeName";
    private static final String SPEC = "spec";
    private static final String DESIGN_APPROACH = "designApproach";

    private OpenApiServiceTypeNameValidator() {
    }

    /** Validates an initialization model before its selected choice is flattened by the builder. */
    public static List<ValidationResult> validate(ServiceInitModel model) {
        return validate(findCandidate(model.getProperties()));
    }

    private static List<ValidationResult> validate(Candidate candidate) {
        if (candidate == null || candidate.name().isBlank() || candidate.spec().isBlank()) {
            return List.of();
        }

        Optional<String> message = openApiSchemaConflict(candidate.name(), candidate.spec());
        if (message.isEmpty()) {
            return List.of();
        }
        return List.of(new ValidationResult(candidate.propertyPath(), RULE, message.get(),
                ValidationSeverity.ERROR));
    }

    private static Optional<String> openApiSchemaConflict(String name, String specPath) {
        try {
            SwaggerParseResult parseResult = new OpenAPIV3Parser().readContents(Files.readString(Path.of(specPath)));
            OpenAPI openAPI = parseResult.getOpenAPI();
            if (openAPI == null || openAPI.getComponents() == null || openAPI.getComponents().getSchemas() == null) {
                return Optional.empty();
            }
            String serviceTypeName = unquoted(name);
            boolean conflicts = openAPI.getComponents().getSchemas().keySet().stream()
                    .map(schemaName -> unquoted(GeneratorUtils.getValidName(schemaName, true)))
                    .anyMatch(serviceTypeName::equals);
            return conflicts
                    ? Optional.of("Service type name '%s' conflicts with a type generated from the OpenAPI "
                    .formatted(name) + "specification")
                    : Optional.empty();
        } catch (IOException ignored) {
            // The OpenAPI generator reports malformed or unreadable specifications through its existing
            // generation error path. This validator must not hide that more specific diagnostic.
            return Optional.empty();
        }
    }

    /** Keyword type names are emitted as quoted identifiers ({@code 'error}); compare them unquoted. */
    private static String unquoted(String identifier) {
        return identifier.startsWith("'") ? identifier.substring(1) : identifier;
    }

    private static Candidate findCandidate(Map<String, Value> properties) {
        if (properties == null) {
            return null;
        }

        Value designApproach = properties.get(DESIGN_APPROACH);
        if (designApproach == null || designApproach.getChoices() == null) {
            return null;
        }
        for (int index = 0; index < designApproach.getChoices().size(); index++) {
            Value choice = designApproach.getChoices().get(index);
            if (choice == null || !choice.isEnabled() || choice.getProperties() == null) {
                continue;
            }
            Value name = choice.getProperties().get(SERVICE_TYPE_NAME);
            Value spec = choice.getProperties().get(SPEC);
            if (name != null && spec != null) {
                return candidate(name, spec, DESIGN_APPROACH + ".choices." + index + "." + SERVICE_TYPE_NAME);
            }
        }
        return null;
    }

    private static Candidate candidate(Value name, Value spec, String propertyPath) {
        return new Candidate(name.getValue(), spec.getValue(), propertyPath);
    }

    private record Candidate(String name, String spec, String propertyPath) {
        private Candidate(Object name, Object spec, String propertyPath) {
            this(Objects.toString(name, ""), Objects.toString(spec, ""), propertyPath);
        }
    }
}
