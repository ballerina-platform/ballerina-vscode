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

import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.modelgenerator.commons.trigger.models.TriggerUISchemaModel;
import io.ballerina.servicemodelgenerator.extension.connector.SchemaDrivenSourceGenerator;
import io.ballerina.servicemodelgenerator.extension.model.PropertyType;
import io.ballerina.servicemodelgenerator.extension.model.ServiceInitModel;
import io.ballerina.servicemodelgenerator.extension.model.ValidationRule;
import io.ballerina.servicemodelgenerator.extension.model.Value;
import io.ballerina.servicemodelgenerator.extension.model.context.GetServiceInitModelContext;
import org.eclipse.lsp4j.TextEdit;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import static io.ballerina.servicemodelgenerator.extension.util.Constants.NEW_LINE;

/**
 * The per-channel knowledge an agent trigger needs.
 *
 * @since 1.9.0
 */
public interface AgentTriggerChannel {

    AgentTriggerKind kind();

    default AgentTriggerDeletionScope deletionScope() {
        return AgentTriggerDeletionScope.SERVICE;
    }

    default Map<String, Value> additionalProperties() {
        return Map.of();
    }

    default List<String> imports() {
        return List.of("ballerina/log");
    }

    default boolean isSchemaDriven() {
        return true;
    }

    default Optional<ServiceInitModel> initModel(GetServiceInitModelContext context) {
        return Optional.empty();
    }

    default Optional<SchemaDrivenSourceGenerator.ResolvedListener> listener(ModulePartNode rootNode, String alias) {
        return Optional.empty();
    }

    default Optional<SchemaDrivenSourceGenerator.ResolvedListener> listener(ModulePartNode rootNode, String alias,
                                                                           Map<String, String> formValues) {
        return listener(rootNode, alias);
    }

    default void customizeInitModel(ServiceInitModel initModel, TriggerUISchemaModel triggerModel) {
    }

    record HandlerBinding(String handlerName, String replyMethodName, String offload, String replyMethod,
                          String handler) {
    }

    default Optional<HandlerBinding> handlerBinding(AgentTriggerContext context) {
        return Optional.empty();
    }

    String serviceBlock(AgentTriggerContext context);

    default Optional<List<TextEdit>> appendToExistingService(ModulePartNode rootNode,
                                                             AgentTriggerContext context) {
        return Optional.empty();
    }

    String INSTRUCTIONS = "instructions";
    String INDENT = "    ";

    static Value instructionsField(String description, String defaultValue) {
        return new Value.ValueBuilder()
                .metadata("Instructions", description)
                .types(List.of(PropertyType.types(Value.FieldType.DOC_TEXT, "string")))
                .enabled(true)
                .editable(true)
                .optional(false)
                .value(defaultValue)
                .setValidations(List.of(new ValidationRule("common.validate.required")))
                .build();
    }

    static String indent(String source) {
        return INDENT + source.replace(NEW_LINE, NEW_LINE + INDENT);
    }
}
