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

package io.ballerina.servicemodelgenerator.extension.connector.adapter;

import io.ballerina.compiler.syntax.tree.ServiceDeclarationNode;
import io.ballerina.modelgenerator.commons.ReadOnlyMetaData;
import io.ballerina.modelgenerator.commons.trigger.models.TriggerUISchemaModel;
import io.ballerina.servicemodelgenerator.extension.extractor.AnnotationExtractor;
import io.ballerina.servicemodelgenerator.extension.extractor.ListenerParamExtractor;
import io.ballerina.servicemodelgenerator.extension.extractor.ServiceDescriptionExtractor;
import io.ballerina.servicemodelgenerator.extension.model.Codedata;
import io.ballerina.servicemodelgenerator.extension.model.PropertyType;
import io.ballerina.servicemodelgenerator.extension.model.Service;
import io.ballerina.servicemodelgenerator.extension.model.Value;
import io.ballerina.servicemodelgenerator.extension.model.context.ModelFromSourceContext;
import io.ballerina.servicemodelgenerator.extension.util.Utils;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static io.ballerina.servicemodelgenerator.extension.util.Constants.ARG_TYPE_SERVICE_BASE_PATH;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.CD_TYPE_SERVICE_ANNOTATION;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.CD_TYPE_STRING_LITERAL;

/**
 * Builds the schema-driven service model's {@code readOnlyMetadata} property — the read-only summary
 * chips ("Monitored Path", "Queue Name", ...) the designer renders in the service-card header, resolved
 * from the user's source via the shared extractors ({@link AnnotationExtractor},
 * {@link ListenerParamExtractor}, {@link ServiceDescriptionExtractor}).
 *
 * @since 1.9.0
 */
public final class TriggerReadOnlyMetadataAdapter {

    private static final String KIND_LISTENER_PARAM = "LISTENER_PARAM";
    private static final String KIND_SERVICE_DESCRIPTION = "SERVICE_DESCRIPTION";

    // Wire kinds understood by the shared extractors (differ from the trigger-model JSON kinds above).
    private static final String EXTRACTOR_KIND_ANNOTATION = "ANNOTATION";
    private static final String EXTRACTOR_KIND_LISTENER_PARAM = "LISTENER_PARAM";
    private static final String EXTRACTOR_KIND_SERVICE_DESCRIPTION = "SERVICE_DESCRIPTION";

    private static final String READONLY = "READONLY";
    private static final String PLACEHOLDER_FALSE = "false";

    // Stateless (no instance fields), so one shared instance per extractor is safe to reuse across
    // every definition instead of allocating fresh ones.
    private static final AnnotationExtractor ANNOTATION_EXTRACTOR = new AnnotationExtractor();
    private static final ListenerParamExtractor LISTENER_PARAM_EXTRACTOR = new ListenerParamExtractor();
    private static final ServiceDescriptionExtractor SERVICE_DESCRIPTION_EXTRACTOR = new ServiceDescriptionExtractor();

    private TriggerReadOnlyMetadataAdapter() {
    }

    /** Returns {@code null} when the model ships no definitions, so callers can leave the property off. */
    public static Value build(List<TriggerUISchemaModel.ReadOnlyMetadata> definitions, Service serviceModel,
                              ServiceDeclarationNode serviceNode, ModelFromSourceContext context) {
        if (definitions == null || definitions.isEmpty()) {
            return null;
        }

        // Aggregates values sharing a display name (e.g. RabbitMQ's two "Queue Name" definitions).
        Map<String, List<String>> resolved = new LinkedHashMap<>();
        for (TriggerUISchemaModel.ReadOnlyMetadata definition : definitions) {
            if (definition == null) {
                continue;
            }
            String displayName = displayNameOf(definition);
            List<String> bucket = resolved.computeIfAbsent(displayName, key -> new ArrayList<>());
            bucket.addAll(resolveValues(definition, serviceModel, serviceNode, context));
        }

        return new Value.ValueBuilder()
                .setCodedata(new Codedata(READONLY))
                .value(resolved)
                .types(List.of(PropertyType.types(Value.FieldType.SINGLE_SELECT)))
                .setPlaceholder(PLACEHOLDER_FALSE)
                .optional(false)
                .setAdvanced(false)
                .enabled(true)
                .editable(true)
                .build();
    }

    private static List<String> resolveValues(TriggerUISchemaModel.ReadOnlyMetadata definition, Service serviceModel,
                                               ServiceDeclarationNode serviceNode, ModelFromSourceContext context) {
        String kind = definition.kind() == null ? "" : definition.kind();
        String displayName = displayNameOf(definition);
        return switch (kind) {
            case CD_TYPE_SERVICE_ANNOTATION -> flatten(ANNOTATION_EXTRACTOR.extractValues(
                    new ReadOnlyMetaData(annotationField(definition), displayName, EXTRACTOR_KIND_ANNOTATION),
                    serviceNode, context));
            case KIND_LISTENER_PARAM -> flatten(LISTENER_PARAM_EXTRACTOR.extractValues(
                    new ReadOnlyMetaData(definition.key(), displayName, EXTRACTOR_KIND_LISTENER_PARAM),
                    serviceNode, context));
            case CD_TYPE_STRING_LITERAL -> stringLiteralValue(serviceModel);
            case KIND_SERVICE_DESCRIPTION, ARG_TYPE_SERVICE_BASE_PATH -> flatten(SERVICE_DESCRIPTION_EXTRACTOR
                    .extractValues(new ReadOnlyMetaData(definition.key(), displayName,
                            EXTRACTOR_KIND_SERVICE_DESCRIPTION), serviceNode, context));
            default -> List.of();
        };
    }

    /** The trailing segment of {@code path} (e.g. {@code ServiceConfig.path} to {@code path}), or {@code key}. */
    private static String annotationField(TriggerUISchemaModel.ReadOnlyMetadata definition) {
        String path = definition.path();
        if (path != null && !path.isBlank()) {
            int lastDot = path.lastIndexOf('.');
            return lastDot >= 0 ? path.substring(lastDot + 1) : path;
        }
        return definition.key();
    }

    private static List<String> stringLiteralValue(Service serviceModel) {
        Value stringLiteral = serviceModel.getStringLiteralProperty();
        if (stringLiteral == null) {
            return List.of();
        }
        String value = stringLiteral.getValue();
        if (value == null || value.isBlank()) {
            return List.of();
        }
        value = Utils.unquote(value.trim());
        return value.isEmpty() ? List.of() : List.of(value);
    }

    private static String displayNameOf(TriggerUISchemaModel.ReadOnlyMetadata definition) {
        String displayName = definition.displayName();
        return displayName != null && !displayName.isBlank() ? displayName : definition.key();
    }

    private static List<String> flatten(Map<String, List<String>> extracted) {
        List<String> values = new ArrayList<>();
        extracted.values().forEach(values::addAll);
        return values;
    }
}
