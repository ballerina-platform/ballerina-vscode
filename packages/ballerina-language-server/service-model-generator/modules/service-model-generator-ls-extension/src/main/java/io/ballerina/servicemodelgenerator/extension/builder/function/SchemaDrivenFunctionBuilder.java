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

package io.ballerina.servicemodelgenerator.extension.builder.function;

import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.modelgenerator.commons.ModulePrefixContext;
import io.ballerina.modelgenerator.commons.trigger.models.TriggerUISchemaModel;
import io.ballerina.projects.Document;
import io.ballerina.servicemodelgenerator.extension.connector.AnnotationEmitter;
import io.ballerina.servicemodelgenerator.extension.connector.IncludedRecordBinder;
import io.ballerina.servicemodelgenerator.extension.connector.TriggerModelReader;
import io.ballerina.servicemodelgenerator.extension.connector.adapter.PropertyValueAdapter;
import io.ballerina.servicemodelgenerator.extension.model.Codedata;
import io.ballerina.servicemodelgenerator.extension.model.Function;
import io.ballerina.servicemodelgenerator.extension.model.MetaData;
import io.ballerina.servicemodelgenerator.extension.model.Parameter;
import io.ballerina.servicemodelgenerator.extension.model.Value;
import io.ballerina.servicemodelgenerator.extension.model.context.AddModelContext;
import io.ballerina.servicemodelgenerator.extension.model.context.ModelFromSourceContext;
import io.ballerina.servicemodelgenerator.extension.model.context.UpdateModelContext;
import org.eclipse.lsp4j.TextEdit;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

import static io.ballerina.servicemodelgenerator.extension.util.Constants.CD_TYPE_ANNOTATION_ATTACHMENT;
import static io.ballerina.servicemodelgenerator.extension.util.ServiceModelUtils.getServiceTypeIdentifier;

/**
 * Schema-driven function builder for connectors that ship a unified {@link TriggerUISchemaModel}.
 * Inherits source generation from {@link AbstractFunctionBuilder} and adds metadata overlay on read
 * and annotation-tree rendering (via {@link AnnotationEmitter}) before add/update.
 *
 * @since 1.8.0
 */
public class SchemaDrivenFunctionBuilder extends AbstractFunctionBuilder {

    public static final String KIND = "schema-driven";

    @Override
    public String kind() {
        return KIND;
    }

    @Override
    public Map<String, List<TextEdit>> addModel(AddModelContext context) throws Exception {
        // Must run before renderComplexAnnotations, which bakes qualifiers into the rendered string.
        requalifyModuleReferences(context.function(), context.document());
        renderComplexAnnotations(context.function());
        // Must run before the emitter: it rewrites the payload param's type to the generated wrapper.
        Map<String, List<TextEdit>> typeEdits = IncludedRecordBinder.forAdd(context);
        return mergeEdits(super.addModel(context), typeEdits);
    }

    @Override
    public Map<String, List<TextEdit>> updateModel(UpdateModelContext context) {
        requalifyModuleReferences(context.function(), context.document());
        renderComplexAnnotations(context.function());
        Map<String, List<TextEdit>> typeEdits = IncludedRecordBinder.forUpdate(context);
        return mergeEdits(super.updateModel(context), typeEdits);
    }

    /**
     * Re-qualifies every module reference a function emits (parameter types, return type, annotation
     * qualifiers) onto the prefixes the target file actually binds, since the trigger model authors
     * against a module's natural prefix which may be aliased in the target file.
     */
    private static void requalifyModuleReferences(Function function, Document document) {
        Codedata codedata = function == null ? null : function.getCodedata();
        if (codedata == null || document == null
                || !(document.syntaxTree().rootNode() instanceof ModulePartNode rootNode)) {
            return;
        }
        String module = codedata.getModuleName();
        if (module == null || module.isBlank()) {
            return;
        }
        ModulePrefixContext prefixes = ModulePrefixContext.from(rootNode);
        // Register the function's own module first so it wins any natural-prefix tie.
        prefixes.prefixFor(codedata.getOrgName(), module);
        requalifyProperties(function.getProperties(), prefixes);
        if (!prefixes.hasAliases()) {
            return;
        }
        if (function.getParameters() != null) {
            for (Parameter parameter : function.getParameters()) {
                requalify(parameter.getType(), prefixes);
            }
        }
        requalify(function.getReturnType(), prefixes);
    }

    /**
     * Resolves the {@code valueQualifier} of every enum literal in a property tree, in place, to the
     * prefix its module is bound to ({@code afterProcess: ftp:DELETE} &rarr; {@code ftp2:DELETE}).
     * Must happen here rather than at render time since {@code renderComplexAnnotations} collapses the
     * tree into a string first. Recurses through nested properties and choice branches.
     */
    private static void requalifyProperties(Map<String, Value> properties, ModulePrefixContext prefixes) {
        if (properties == null) {
            return;
        }
        for (Value property : properties.values()) {
            requalifyProperty(property, prefixes);
        }
    }

    private static void requalifyProperty(Value property, ModulePrefixContext prefixes) {
        if (property == null) {
            return;
        }
        Codedata codedata = property.getCodedata();
        if (codedata != null) {
            // Register (never overwrite) the declared module for precise qualifier resolution.
            if (codedata.getModuleName() != null && !codedata.getModuleName().isBlank()) {
                prefixes.prefixFor(codedata.getOrgName(), codedata.getModuleName());
            }
            if (codedata.getValueQualifier() != null && !codedata.getValueQualifier().isBlank()) {
                codedata.setValueQualifier(prefixes.prefixForQualifier(
                        codedata.getOrgName(), codedata.getModuleName(), codedata.getValueQualifier()));
            }
        }
        requalifyProperties(property.getProperties(), prefixes);
        if (property.getChoices() != null) {
            for (Value choice : property.getChoices()) {
                requalifyProperty(choice, prefixes);
            }
        }
    }

    private static void requalify(Value type, ModulePrefixContext prefixes) {
        if (type == null) {
            return;
        }
        String current = type.getValue();
        if (current == null || current.isEmpty()) {
            return;
        }
        String rewritten = prefixes.requalify(current);
        if (!rewritten.equals(current)) {
            type.setValue(rewritten);
        }
    }

    /** Merges the types.bal edits of an included-record binding into the emitter's edit map. */
    private static Map<String, List<TextEdit>> mergeEdits(Map<String, List<TextEdit>> main,
                                                          Map<String, List<TextEdit>> extra) {
        if (extra.isEmpty()) {
            return main;
        }
        Map<String, List<TextEdit>> merged = new HashMap<>(main);
        extra.forEach((file, edits) -> merged.merge(file, edits, (a, b) -> {
            List<TextEdit> all = new ArrayList<>(a);
            all.addAll(b);
            return all;
        }));
        return merged;
    }

    /**
     * Collapses every COMPLEX_FUNCTION_ANNOTATION property into an ANNOTATION_ATTACHMENT property
     * carrying the rendered mapping body. Public for testing.
     */
    public static void renderComplexAnnotations(Function function) {
        if (function == null) {
            return;
        }
        for (Map.Entry<String, Value> entry : function.getProperties().entrySet()) {
            Value property = entry.getValue();
            Codedata codedata = property.getCodedata();
            if (codedata == null || !"COMPLEX_FUNCTION_ANNOTATION".equals(codedata.getType())) {
                continue;
            }
            Optional<String> body = AnnotationEmitter.annotationBody(PropertyValueAdapter.toProperty(property));
            Codedata attachment = new Codedata(CD_TYPE_ANNOTATION_ATTACHMENT);
            attachment.setOriginalName(codedata.getOriginalName());
            attachment.setModuleName(codedata.getModuleName());
            Value rendered = new Value.ValueBuilder()
                    .setMetadata(property.getMetadata())
                    .value(body.orElse(""))
                    .enabled(body.isPresent())
                    .editable(true)
                    .setCodedata(attachment)
                    .build();
            entry.setValue(rendered);
        }
    }

    @Override
    public Function getModelFromSource(ModelFromSourceContext context) {
        Function function = super.getModelFromSource(context);
        Optional<TriggerUISchemaModel> triggerModel = TriggerModelReader.getInstance()
                .getSchemaDrivenTriggerModel(context.orgName(), context.moduleName(), context.version());
        if (triggerModel.isPresent()) {
            overlayConnectorMetadata(function, triggerModel.get(), context.serviceType());
            stampCodedata(function, context);
        }
        return function;
    }

    /** Overlays curated function/parameter metadata onto a source-parsed function. Package-visible for testing. */
    static void overlayConnectorMetadata(Function function, TriggerUISchemaModel triggerModel, String serviceType) {
        TriggerUISchemaModel.FunctionModel model = findFunctionModel(triggerModel, serviceType,
                function.getName() != null ? function.getName().getValue() : null);
        if (model == null) {
            return;
        }
        if (model.metadata() != null) {
            function.setMetadata(new MetaData(
                    orElse(model.metadata().label(), function.getName().getValue()),
                    orElse(model.metadata().description(), "")));
        }
        if (model.parameters() == null || function.getParameters() == null) {
            return;
        }
        for (Parameter wireParam : function.getParameters()) {
            String name = wireParam.getName() != null ? wireParam.getName().getValue() : null;
            model.parameters().stream()
                    .filter(p -> p.name() != null && Objects.equals(String.valueOf(p.name().value()), name))
                    .findFirst()
                    .ifPresent(p -> {
                        if (p.metadata() != null) {
                            wireParam.setMetadata(new MetaData(
                                    orElse(p.metadata().label(), name),
                                    orElse(p.metadata().description(), "")));
                        }
                    });
        }
    }

    private static TriggerUISchemaModel.FunctionModel findFunctionModel(TriggerUISchemaModel triggerModel,
                                                                  String serviceType, String functionName) {
        if (triggerModel == null || triggerModel.serviceTypes() == null || functionName == null) {
            return null;
        }
        TriggerUISchemaModel.ServiceTypeModel type = findServiceType(triggerModel, serviceType);
        if (type == null) {
            return null;
        }
        TriggerUISchemaModel.FunctionModel found = findByName(type.functions(), functionName);
        return found != null ? found : findByName(type.schemaFunctions(), functionName);
    }

    private static TriggerUISchemaModel.ServiceTypeModel findServiceType(TriggerUISchemaModel triggerModel,
                                                                          String serviceType) {
        String typeKey = serviceType == null ? null : getServiceTypeIdentifier(serviceType);
        if (typeKey != null) {
            for (TriggerUISchemaModel.ServiceTypeModel candidate : triggerModel.serviceTypes()) {
                if (typeKey.equals(candidate.name())
                        || (candidate.name() != null && candidate.name().endsWith(":" + typeKey))
                        || (candidate.codedata() != null && typeKey.equals(candidate.codedata().originalName()))) {
                    return candidate;
                }
            }
        }
        return triggerModel.serviceTypes().size() == 1 ? triggerModel.serviceTypes().get(0) : null;
    }

    private static TriggerUISchemaModel.FunctionModel findByName(List<TriggerUISchemaModel.FunctionModel> functions,
                                                                   String name) {
        if (functions == null) {
            return null;
        }
        return functions.stream().filter(f -> name.equals(f.name())).findFirst().orElse(null);
    }

    private void stampCodedata(Function function, ModelFromSourceContext context) {
        Codedata codedata = function.getCodedata();
        if (codedata == null) {
            codedata = new Codedata();
            function.setCodedata(codedata);
        }
        codedata.setOrgName(context.orgName());
        codedata.setPackageName(context.packageName());
        codedata.setModuleName(context.moduleName());
        if (context.version() != null) {
            codedata.setVersion(context.version());
        }
    }

    private static String orElse(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value;
    }
}
