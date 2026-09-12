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

package io.ballerina.servicemodelgenerator.extension.builder.service;

import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.compiler.syntax.tree.ServiceDeclarationNode;
import io.ballerina.modelgenerator.commons.trigger.models.TriggerUISchemaModel;
import io.ballerina.servicemodelgenerator.extension.connector.ConnectorVersionResolver;
import io.ballerina.servicemodelgenerator.extension.connector.ExistingListenerResolver;
import io.ballerina.servicemodelgenerator.extension.connector.IncludedRecordBinder;
import io.ballerina.servicemodelgenerator.extension.connector.LocalDependencyEditUtil;
import io.ballerina.servicemodelgenerator.extension.connector.PlatformDependencyEditUtil;
import io.ballerina.servicemodelgenerator.extension.connector.SchemaDrivenSourceGenerator;
import io.ballerina.servicemodelgenerator.extension.connector.TriggerModelReader;
import io.ballerina.servicemodelgenerator.extension.connector.adapter.TriggerReadOnlyMetadataAdapter;
import io.ballerina.servicemodelgenerator.extension.connector.adapter.TriggerServiceAdapter;
import io.ballerina.servicemodelgenerator.extension.connector.adapter.TriggerSourceMerger;
import io.ballerina.servicemodelgenerator.extension.model.Codedata;
import io.ballerina.servicemodelgenerator.extension.model.Function;
import io.ballerina.servicemodelgenerator.extension.model.MetaData;
import io.ballerina.servicemodelgenerator.extension.model.PropertyType;
import io.ballerina.servicemodelgenerator.extension.model.Service;
import io.ballerina.servicemodelgenerator.extension.model.ServiceInitModel;
import io.ballerina.servicemodelgenerator.extension.model.Value;
import io.ballerina.servicemodelgenerator.extension.model.context.AddServiceInitModelContext;
import io.ballerina.servicemodelgenerator.extension.model.context.GetServiceInitModelContext;
import io.ballerina.servicemodelgenerator.extension.model.context.ModelFromSourceContext;
import io.ballerina.servicemodelgenerator.extension.util.ListenerUtil;
import io.ballerina.servicemodelgenerator.extension.util.Utils;
import org.eclipse.lsp4j.TextEdit;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;

import static io.ballerina.servicemodelgenerator.extension.model.ServiceInitModel.KEY_CONFIGURE_LISTENER;
import static io.ballerina.servicemodelgenerator.extension.model.ServiceInitModel.KEY_EXISTING_LISTENER;
import static io.ballerina.servicemodelgenerator.extension.model.ServiceInitModel.KEY_LISTENER_VAR_NAME;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.ARG_TYPE_LISTENER_VAR_NAME;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.CD_TYPE_LISTENER_CONFIG;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.LISTENER_VAR_NAME;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.PROP_READONLY_METADATA_KEY;
import static io.ballerina.servicemodelgenerator.extension.util.ServiceModelUtils.getProtocol;
import static io.ballerina.servicemodelgenerator.extension.util.ServiceModelUtils.getServiceTypeIdentifier;

/**
 * Schema-driven service builder for connectors whose unified {@link TriggerUISchemaModel} is bundled
 * as a classpath resource in this jar. Serves the add-event-integration flow with no per-connector
 * code, emitting source via {@link SchemaDrivenSourceGenerator}. Selected by {@code ServiceBuilderRouter}
 * only when no hardcoded builder is registered and {@link TriggerModelReader} finds a model.
 *
 * @since 1.8.0
 */
public class SchemaDrivenServiceBuilder extends AbstractServiceBuilder {

    public static final String KIND = "schema-driven";

    @Override
    public String kind() {
        return KIND;
    }

    @Override
    public ServiceInitModel getServiceInitModel(GetServiceInitModelContext context) {
        // Modelled against the version the project actually compiles against, not the newest release.
        String version = ConnectorVersionResolver.resolve(context.project(), context.orgName(),
                context.packageName(), context.version());
        Optional<ServiceInitModel> triggerInit = TriggerModelReader.getInstance()
                .getSchemaDrivenServiceInitModel(context.orgName(), context.moduleName(), version,
                        context.isLocalRepository());
        if (triggerInit.isEmpty()) {
            return null;
        }
        ServiceInitModel initModel = triggerInit.get();
        refreshListenerName(initModel, context);
        populateExistingListeners(initModel, context);
        PlatformDependencyEditUtil.populateDriverDependencyFields(initModel, context.project());
        return initModel;
    }

    @Override
    public Map<String, List<TextEdit>> addServiceInitSource(AddServiceInitModelContext context) {
        ServiceInitModel filledModel = context.serviceInitModel();
        ModulePartNode rootNode = context.document().syntaxTree().rootNode();
        Optional<TriggerUISchemaModel> triggerModel = TriggerModelReader.getInstance()
                .getSchemaDrivenTriggerModel(filledModel.getOrgName(), filledModel.getModuleName(),
                        filledModel.getVersion(), filledModel.isLocalRepository());
        if (triggerModel.isEmpty()) {
            return Map.of();
        }
        Map<String, List<TextEdit>> edits = new LinkedHashMap<>(SchemaDrivenSourceGenerator
                .buildAddServiceEditsForTrigger(filledModel, triggerModel.get(), rootNode, context.filePath()));
        if (filledModel.isLocalRepository()) {
            LocalDependencyEditUtil.addIfMissing(edits, context.project(), filledModel.getOrgName(),
                    filledModel.getPackageName(), filledModel.getVersion());
        }
        PlatformDependencyEditUtil.addDriverDependenciesIfPresent(edits, context.project(),
                filledModel.getProperties());
        return edits;
    }

    @Override
    public Service getModelFromSource(ModelFromSourceContext context) {
        Optional<TriggerUISchemaModel> triggerModel = TriggerModelReader.getInstance()
                .getSchemaDrivenTriggerModel(context.orgName(), context.moduleName(), context.version());
        if (triggerModel.isEmpty()) {
            // Not a schema-driven connector after all -> fall back to the DB-backed behaviour.
            return super.getModelFromSource(context);
        }
        if (Objects.isNull(context.serviceType())) {
            return null;
        }
        String serviceType = getServiceTypeIdentifier(context.serviceType());
        Service serviceModel = TriggerServiceAdapter.toServiceTemplate(triggerModel.get(),
                serviceType, context.orgName(), context.packageName(), context.moduleName());
        if (serviceModel == null) {
            return null;
        }
        serviceModel.getServiceType().setValue(serviceType);
        serviceModel.getServiceType().setEditable(false);
        serviceModel.getServiceType().setEnabled(triggerModel.get().serviceTypes().size() > 1);
        populateServiceModelFromSource(serviceModel, (ServiceDeclarationNode) context.node(), context);

        Value stringLiteralProperty = serviceModel.getStringLiteralProperty();
        if (stringLiteralProperty != null) {
            String stringLiteral = stringLiteralProperty.getValue();
            stringLiteralProperty.setEnabled(!stringLiteralProperty.isOptional()
                    || (stringLiteral != null && !stringLiteral.isEmpty()));
        }

        // Resolves the payload field for included-record wrapper types (e.g. KafkaAnydataConsumer1[]).
        IncludedRecordBinder.overlayFromSource(serviceModel, context);

        Value readOnlyMetadata = TriggerReadOnlyMetadataAdapter.build(triggerModel.get().readOnlyMetadata(),
                serviceModel, (ServiceDeclarationNode) context.node(), context);
        if (readOnlyMetadata != null) {
            serviceModel.getProperties().put(PROP_READONLY_METADATA_KEY, readOnlyMetadata);
        }
        return serviceModel;
    }

    /** Enriches source functions with their schema variant's data instead of the default enable/disable merge. */
    @Override
    protected void mergeSourceFunctions(Service serviceModel, List<Function> functionsInSource) {
        if (serviceModel.getSchemaFunctions() != null) {
            TriggerSourceMerger.mergeSource(serviceModel, functionsInSource);
            return;
        }
        super.mergeSourceFunctions(serviceModel, functionsInSource);
    }

    /**
     * Populates the "use existing" branch of the listener {@code configureListener} CHOICE with
     * compatible listeners already in the project. Disabled when none are found.
     */
    private void populateExistingListeners(ServiceInitModel creationModel, GetServiceInitModelContext context) {
        Value configureListener = findListenerChoice(creationModel);
        if (configureListener == null || configureListener.getChoices() == null
                || configureListener.getChoices().size() < 2) {
            return;
        }
        List<Value> choices = configureListener.getChoices();
        Set<String> listeners = ListenerUtil.getCompatibleListeners(context.moduleName(),
                context.semanticModel(), context.project());
        Value selector = null;
        if (!listeners.isEmpty()) {
            Value createNewBranch = choices.get(indexOfCreateNewBranch(choices));
            selector = ExistingListenerResolver.buildSelector(createNewBranch, new ArrayList<>(listeners),
                    context.semanticModel(), context.project(), getProtocol(context.moduleName()));
        } else {
            int useExistingIndex = indexOfCreateNewBranch(choices) == 0 ? 1 : 0;
            Value useExistingBranch = choices.get(useExistingIndex);
            useExistingBranch.setMetadata(new MetaData("Use existing (none available)",
                    "No compatible listener of this type is present in the project."));
        }
        applyListenerChoiceSelection(configureListener, selector);
    }

    /** Wires the listener {@code configureListener} CHOICE (pure; unit-testable). */
    static void applyListenerChoiceSelection(Value configureListener, Value selector) {
        List<Value> choices = configureListener.getChoices();
        if (choices == null || choices.size() < 2) {
            return;
        }
        int createNewIndex = indexOfCreateNewBranch(choices);
        int useExistingIndex = createNewIndex == 0 ? 1 : 0;
        Value createNewChoice = choices.get(createNewIndex);
        Value useExistingChoice = choices.get(useExistingIndex);

        if (selector == null) {
            useExistingChoice.setEnabled(false);
            useExistingChoice.setEditable(false);
            createNewChoice.setEnabled(true);
            createNewChoice.setEditable(true);
            configureListener.setValue(String.valueOf(createNewIndex));
            return;
        }

        Map<String, Value> existingProps = new LinkedHashMap<>();
        existingProps.put(KEY_EXISTING_LISTENER, selector);
        Value group = firstGroupSection(useExistingChoice);
        if (group == null) {
            group = new Value.ValueBuilder()
                    .metadata("Listener Configurations", "Configuration of the selected listener.")
                    .types(List.of(PropertyType.types(Value.FieldType.GROUP_SECTION)))
                    .enabled(true)
                    .editable(true)
                    .build();
            Map<String, Value> branchProps = new LinkedHashMap<>();
            branchProps.put("listenerConfig", group);
            useExistingChoice.setProperties(branchProps);
        }
        group.setProperties(existingProps);
        // Both branches stay `editable` so the front-end radio lets the user switch between them.
        useExistingChoice.setEnabled(true);
        useExistingChoice.setEditable(true);
        createNewChoice.setEnabled(false);
        createNewChoice.setEditable(true);
        configureListener.setValue(String.valueOf(useExistingIndex));
    }

    private static Value firstGroupSection(Value branch) {
        if (branch.getProperties() == null) {
            return null;
        }
        for (Value child : branch.getProperties().values()) {
            if (child.getTypes() != null
                    && child.getTypes().stream().anyMatch(type -> type.fieldType() == Value.FieldType.GROUP_SECTION)) {
                return child;
            }
        }
        return null;
    }

    /** Index of the "create new" branch (carries listener params). Defaults to 0 when none is detected. */
    private static int indexOfCreateNewBranch(List<Value> choices) {
        for (int i = 0; i < choices.size(); i++) {
            if (hasListenerParams(choices.get(i))) {
                return i;
            }
        }
        return 0;
    }

    private static boolean hasListenerParams(Value node) {
        if (node == null) {
            return false;
        }
        Codedata codedata = node.getCodedata();
        if (codedata != null) {
            String argType = codedata.getArgType();
            if ((argType != null && argType.startsWith("LISTENER_PARAM"))
                    || ARG_TYPE_LISTENER_VAR_NAME.equals(codedata.getType())
                    || ARG_TYPE_LISTENER_VAR_NAME.equals(argType)) {
                return true;
            }
        }
        if (node.getProperties() != null) {
            for (Value child : node.getProperties().values()) {
                if (hasListenerParams(child)) {
                    return true;
                }
            }
        }
        if (node.getChoices() != null) {
            for (Value choice : node.getChoices()) {
                if (hasListenerParams(choice)) {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * Replaces the shipped default listener variable name with a project-unique identifier, on every
     * listener-name node. The branches are mutually exclusive, so they should all offer the same name.
     */
    private void refreshListenerName(ServiceInitModel creationModel, GetServiceInitModelContext context) {
        List<Value> listenerNames = new ArrayList<>();
        Value topLevel = creationModel.getProperties().get(KEY_LISTENER_VAR_NAME);
        if (topLevel != null) {
            listenerNames.add(topLevel);
        } else {
            collectListenerVarNameNodes(creationModel.getProperties(), listenerNames);
        }
        if (listenerNames.isEmpty()) {
            return;
        }
        String baseName = LISTENER_VAR_NAME.formatted(getProtocol(context.moduleName()));
        for (Value listenerName : listenerNames) {
            Codedata codedata = listenerName.getCodedata();
            String shippedName = listenerName.getValue();
            if (codedata != null && Boolean.TRUE.equals(codedata.getPreserveValue())
                    && shippedName != null && !shippedName.isBlank()) {
                baseName = shippedName.trim();
                break;
            }
        }
        String uniqueName = Utils.generateVariableIdentifier(context.semanticModel(), context.document(),
                context.document().syntaxTree().rootNode().lineRange().endLine(), baseName);
        listenerNames.forEach(listenerName -> listenerName.setValue(uniqueName));
    }

    /** Locates the listener create/reuse CHOICE, by the v1 key or by {@code codedata.type == LISTENER_CONFIG}. */
    private static Value findListenerChoice(ServiceInitModel model) {
        Value byKey = model.getProperties().get(KEY_CONFIGURE_LISTENER);
        if (byKey != null) {
            return byKey;
        }
        for (Value candidate : model.getProperties().values()) {
            if (candidate != null && candidate.getCodedata() != null
                    && CD_TYPE_LISTENER_CONFIG.equals(candidate.getCodedata().getType())) {
                return candidate;
            }
        }
        return null;
    }

    /** Every {@code LISTENER_VAR_NAME} node in the subtree, in document order. */
    static void collectListenerVarNameNodes(Map<String, Value> properties, List<Value> into) {
        if (properties == null) {
            return;
        }
        for (Value value : properties.values()) {
            if (value == null) {
                continue;
            }
            Codedata codedata = value.getCodedata();
            if (codedata != null && ARG_TYPE_LISTENER_VAR_NAME.equals(codedata.getType())) {
                into.add(value);
            }
            collectListenerVarNameNodes(value.getProperties(), into);
            if (value.getChoices() != null) {
                for (Value choice : value.getChoices()) {
                    if (choice != null) {
                        collectListenerVarNameNodes(choice.getProperties(), into);
                    }
                }
            }
        }
    }
}
