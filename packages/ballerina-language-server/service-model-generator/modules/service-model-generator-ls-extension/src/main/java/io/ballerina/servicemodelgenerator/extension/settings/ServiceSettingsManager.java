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

package io.ballerina.servicemodelgenerator.extension.settings;

import io.ballerina.compiler.api.ModuleID;
import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.api.symbols.ModuleSymbol;
import io.ballerina.compiler.syntax.tree.NodeParser;
import io.ballerina.compiler.syntax.tree.ServiceDeclarationNode;
import io.ballerina.servicemodelgenerator.extension.model.ServiceMetadata;
import io.ballerina.servicemodelgenerator.extension.util.ServiceModelUtils;
import org.eclipse.lsp4j.TextEdit;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Reads and writes the fields of a service's config annotation for the designer's Service Settings panel.
 */
public final class ServiceSettingsManager {

    private static final Pattern FIELD_NAME = Pattern.compile("[A-Za-z_][A-Za-z0-9_]*");

    private ServiceSettingsManager() {
    }

    /**
     * The service's module, its settings definition and its config annotation.
     *
     * @param org        the organization of the service's module
     * @param module     the service's module, such as {@code graphql}
     * @param definition the module's curated settings
     * @param annotation the service's config annotation, which may not exist yet
     */
    record Target(String org, String module, ServiceSettingDescriptors.Definition definition,
                  ServiceConfigAnnotation annotation) {
    }

    /**
     * The settings target of the service, empty when its module has no settings definition.
     */
    static Optional<Target> target(ServiceDeclarationNode serviceNode, SemanticModel semanticModel) {
        ServiceMetadata metadata = ServiceModelUtils.deriveServiceType(serviceNode, semanticModel);
        ModuleID moduleId = metadata.moduleId();
        if (moduleId == null) {
            return Optional.empty();
        }
        Optional<ServiceSettingDescriptors.Definition> definition =
                ServiceSettingDescriptors.forModule(moduleId.moduleName());
        if (definition.isEmpty()) {
            return Optional.empty();
        }
        ServiceConfigAnnotation annotation = ServiceConfigAnnotation.of(serviceNode, moduleId.orgName(),
                moduleId.moduleName(), definition.get().annotation());
        return Optional.of(new Target(moduleId.orgName(), moduleId.moduleName(), definition.get(), annotation));
    }

    /**
     * Every curated setting of the service, set or not, followed by the other fields set in source.
     */
    public static ServiceSettingsResponse read(ServiceDeclarationNode serviceNode, SemanticModel semanticModel) {
        Optional<Target> target = target(serviceNode, semanticModel);
        if (target.isEmpty()) {
            return ServiceSettingsResponse.unsupported();
        }
        Map<String, String> values = new LinkedHashMap<>(target.get().annotation().fieldValues());
        List<ServiceSetting> settings = new ArrayList<>();
        for (ServiceSettingDescriptors.Descriptor descriptor : target.get().definition().settings()) {
            settings.add(ServiceSetting.of(descriptor, values.remove(descriptor.field())));
        }
        values.forEach((field, value) -> settings.add(ServiceSetting.advanced(field, value)));
        return new ServiceSettingsResponse(true, target.get().module(), settings, null);
    }

    /**
     * The edits that set the field to the given Ballerina expression, or remove it when the value is null or blank.
     *
     * @throws IllegalArgumentException when the service has no settings, or the field or value is not valid
     */
    public static List<TextEdit> update(ServiceDeclarationNode serviceNode, SemanticModel semanticModel, String field,
                                        String value) {
        if (field == null || !FIELD_NAME.matcher(field).matches()) {
            throw new IllegalArgumentException("Not a valid field name: " + field);
        }
        Target target = target(serviceNode, semanticModel)
                .orElseThrow(() -> new IllegalArgumentException("This service has no editable settings"));
        if (value == null || value.isBlank()) {
            return target.annotation().removeField(field);
        }
        String expression = value.strip();
        if (NodeParser.parseExpression(expression).hasDiagnostics()) {
            throw new IllegalArgumentException("Not a valid value for " + field + ": " + expression);
        }
        return target.annotation().setField(field, expression);
    }

    /**
     * The names declared at module level, which a generated function name must not reuse.
     */
    static Set<String> moduleLevelNames(SemanticModel semanticModel) {
        Set<String> names = new HashSet<>();
        semanticModel.moduleSymbols().forEach(symbol -> {
            if (!(symbol instanceof ModuleSymbol)) {
                symbol.getName().ifPresent(names::add);
            }
        });
        return names;
    }
}
