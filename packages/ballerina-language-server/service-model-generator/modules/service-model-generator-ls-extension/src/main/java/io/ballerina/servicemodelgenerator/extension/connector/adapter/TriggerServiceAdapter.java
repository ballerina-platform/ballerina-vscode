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

import io.ballerina.modelgenerator.commons.CommonUtils;
import io.ballerina.modelgenerator.commons.trigger.models.TriggerUISchemaModel;
import io.ballerina.servicemodelgenerator.extension.model.Codedata;
import io.ballerina.servicemodelgenerator.extension.model.Function;
import io.ballerina.servicemodelgenerator.extension.model.MetaData;
import io.ballerina.servicemodelgenerator.extension.model.PropertyType;
import io.ballerina.servicemodelgenerator.extension.model.Service;
import io.ballerina.servicemodelgenerator.extension.model.Value;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static io.ballerina.servicemodelgenerator.extension.util.Constants.PROP_KEY_LISTENER;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.PROP_KEY_SERVICE_TYPE;
import static io.ballerina.servicemodelgenerator.extension.util.ServiceModelUtils.getListenersProperty;
import static io.ballerina.servicemodelgenerator.extension.util.ServiceModelUtils.getProtocol;

/**
 * Adapts a unified {@link TriggerUISchemaModel} into a wire {@link Service} <i>template</i> for the designer
 * flow. The template (identity + listener/serviceType properties + the selected service type's
 * handler {@link Function}s) is then merged with the user's source.
 *
 * @since 1.9.0
 */
public final class TriggerServiceAdapter {

    private static final String COLON = ":";

    private TriggerServiceAdapter() {
    }

    /**
     * @param serviceType the service type identifier resolved from source; falls back to the
     *                    selected/sole type when not found
     */
    public static Service toServiceTemplate(TriggerUISchemaModel model, String serviceType,
                                            String orgName, String packageName, String moduleName) {
        if (model == null || model.serviceTypes() == null || model.serviceTypes().isEmpty()) {
            return null;
        }
        TriggerUISchemaModel.ServiceTypeModel type = resolveServiceType(model, serviceType);
        if (type == null) {
            return null;
        }
        String protocol = getProtocol(moduleName);
        String displayName = model.displayName() != null ? model.displayName() : model.moduleName();
        String descriptor = serviceDescriptor(type, protocol);

        Map<String, Value> properties = new LinkedHashMap<>();
        Service service = new Service.ServiceModelBuilder()
                .setId("0")
                .setName(displayName)
                .setType(moduleName)
                .setTriggerKind(effectiveTriggerKind(model))
                .setDisplayName(displayName)
                .setModuleName(moduleName)
                .setOrgName(orgName)
                .setVersion(model.version())
                .setPackageName(packageName)
                .setListenerProtocol(protocol)
                .setIcon(CommonUtils.generateIcon(orgName, packageName, model.version()))
                .setProperties(properties)
                .setFunctions(new ArrayList<>())
                .build();

        properties.put(PROP_KEY_LISTENER, getListenersProperty(protocol, listenerKind(model)));
        properties.put(PROP_KEY_SERVICE_TYPE, serviceTypeProperty(descriptor, type));
        addServiceTypeProperties(properties, type.properties());

        // TriggerSourceMerger later folds the user's source into functions/schemaFunctions.
        service.setSchemaFunctions(new ArrayList<>());
        addWireFunctions(service.getFunctions(), type.functions(),
                orgName, packageName, moduleName, model.version());
        addWireFunctions(service.getSchemaFunctions(), type.schemaFunctions(),
                orgName, packageName, moduleName, model.version());
        return service;
    }

    private static String effectiveTriggerKind(TriggerUISchemaModel model) {
        String value = model.triggerKind() == null ? model.kind() : model.triggerKind();
        return switch (value == null ? "" : value) {
            case "event", "mcp", "graphql", "http", "file", "ai" -> value;
            default -> null;
        };
    }

    /** Falls back to {@code SINGLE_SELECT_LISTENER} when {@code listenerKind} is absent or unrecognized. */
    private static Value.FieldType listenerKind(TriggerUISchemaModel model) {
        String kind = model.listenerKind();
        if (kind != null && !kind.isBlank()) {
            try {
                return Value.FieldType.valueOf(kind.trim());
            } catch (IllegalArgumentException ignored) {
                // Unknown widget name -> fall through to the default.
            }
        }
        return Value.FieldType.SINGLE_SELECT_LISTENER;
    }

    private static void addWireFunctions(List<Function> target, List<TriggerUISchemaModel.FunctionModel> functions,
                                         String orgName, String packageName, String moduleName, String version) {
        if (functions == null) {
            return;
        }
        for (TriggerUISchemaModel.FunctionModel function : functions) {
            for (Function wireFunction : TriggerFunctionAdapter.toFunctions(function)) {
                wireFunction.setCodedata(new Codedata.Builder()
                        .setOrgName(orgName)
                        .setPackageName(packageName)
                        .setModuleName(moduleName)
                        .setVersion(version)
                        .build());
                target.add(wireFunction);
            }
        }
    }

    private static TriggerUISchemaModel.ServiceTypeModel resolveServiceType(TriggerUISchemaModel model,
                                                                            String serviceType) {
        if (serviceType != null && !serviceType.isBlank()) {
            for (TriggerUISchemaModel.ServiceTypeModel st : model.serviceTypes()) {
                if (serviceType.equals(st.name())
                        || st.name() != null && st.name().endsWith(COLON + serviceType)
                        || st.codedata() != null && serviceType.equals(st.codedata().originalName())) {
                    return st;
                }
            }
        }
        for (TriggerUISchemaModel.ServiceTypeModel st : model.serviceTypes()) {
            if (Boolean.TRUE.equals(st.enabled())) {
                return st;
            }
        }
        return model.serviceTypes().getFirst();
    }

    /** {@code <module>:<ServiceType>} from the type's codedata, else its (possibly bare) name. */
    private static String serviceDescriptor(TriggerUISchemaModel.ServiceTypeModel type, String protocol) {
        TriggerUISchemaModel.Codedata cd = type.codedata();
        if (cd != null && cd.originalName() != null && !cd.originalName().isBlank()) {
            String module = cd.moduleName() != null && !cd.moduleName().isBlank() ? cd.moduleName() : protocol;
            return module + COLON + cd.originalName();
        }
        String name = type.name() == null ? "" : type.name();
        return name.contains(COLON) ? name : protocol + COLON + name;
    }

    private static void addServiceTypeProperties(Map<String, Value> properties,
                                                 Map<String, TriggerUISchemaModel.Property> typeProperties) {
        if (typeProperties == null) {
            return;
        }
        for (Map.Entry<String, TriggerUISchemaModel.Property> entry : typeProperties.entrySet()) {
            TriggerUISchemaModel.Property property = entry.getValue();
            Value value = PropertyValueAdapter.toValue(property);
            properties.put(entry.getKey(), value);
        }
    }

    private static Value serviceTypeProperty(String descriptor, TriggerUISchemaModel.ServiceTypeModel type) {
        String label = type.metadata() != null && type.metadata().label() != null
                ? type.metadata().label() : "Service Type";
        String description = type.metadata() != null ? type.metadata().description() : "";
        return new Value.ValueBuilder()
                .setMetadata(new MetaData(label, description))
                .value(descriptor)
                .types(List.of(PropertyType.types(Value.FieldType.TYPE)))
                .setPlaceholder(descriptor)
                .enabled(true)
                .editable(false)
                .build();
    }
}
