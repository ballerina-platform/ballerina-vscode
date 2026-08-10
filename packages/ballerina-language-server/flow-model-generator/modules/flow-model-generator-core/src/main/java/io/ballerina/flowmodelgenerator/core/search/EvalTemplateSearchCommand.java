/*
 *  Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
 *
 *  WSO2 LLC. licenses this file to you under the Apache License,
 *  Version 2.0 (the "License"); you may not use this file except
 *  in compliance with the License.
 */

package io.ballerina.flowmodelgenerator.core.search;

import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.api.symbols.AnnotationAttachmentSymbol;
import io.ballerina.compiler.api.symbols.FunctionSymbol;
import io.ballerina.compiler.api.symbols.Qualifier;
import io.ballerina.compiler.api.symbols.Symbol;
import io.ballerina.compiler.api.values.ConstantValue;
import io.ballerina.flowmodelgenerator.core.Constants;
import io.ballerina.flowmodelgenerator.core.model.AvailableNode;
import io.ballerina.flowmodelgenerator.core.model.Category;
import io.ballerina.flowmodelgenerator.core.model.Codedata;
import io.ballerina.flowmodelgenerator.core.model.Item;
import io.ballerina.flowmodelgenerator.core.model.Metadata;
import io.ballerina.flowmodelgenerator.core.model.NodeKind;
import io.ballerina.modelgenerator.commons.PackageUtil;
import io.ballerina.modelgenerator.commons.SearchResult;
import io.ballerina.projects.Module;
import io.ballerina.projects.Package;
import io.ballerina.projects.PackageCompilation;
import io.ballerina.projects.Project;
import io.ballerina.tools.text.LineRange;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

/** Searches the configured AI evaluation package for public functions annotated with {@code @EvalTemplate}. */
public class EvalTemplateSearchCommand extends SearchCommand {

    private static final String TEMPLATE_ANNOTATION = "EvalTemplate";
    private static final String TEMPLATE_PACKAGE = "ai.eval";

    public EvalTemplateSearchCommand(Project project, LineRange position, Map<String, String> queryMap) {
        super(project, position, queryMap);
    }

    @Override
    protected List<Item> defaultView() {
        return templates("");
    }

    @Override
    protected List<Item> search() {
        return templates(query);
    }

    @Override
    protected Map<String, List<SearchResult>> fetchPopularItems() {
        return Collections.emptyMap();
    }

    private List<Item> templates(String filter) {
        Optional<Package> templatePackage = PackageUtil.getModulePackage(PackageUtil.getSampleProject(),
                Constants.Ai.BALLERINA_ORG, TEMPLATE_PACKAGE);
        if (templatePackage.isEmpty()) {
            throw new IllegalStateException("Unable to resolve " + Constants.Ai.BALLERINA_ORG + "/"
                    + TEMPLATE_PACKAGE + " from Ballerina Central.");
        }

        List<Item> templates = new ArrayList<>();
        Package pkg = templatePackage.get();
        String version = pkg.packageVersion().value().toString();
        PackageCompilation compilation = PackageUtil.getCompilation(pkg);
        for (Module module : pkg.modules()) {
            SemanticModel semanticModel = compilation.getSemanticModel(module.moduleId());
            for (Symbol symbol : semanticModel.moduleSymbols()) {
                if (!(symbol instanceof FunctionSymbol functionSymbol) || functionSymbol.getName().isEmpty()
                        || !functionSymbol.qualifiers().contains(Qualifier.PUBLIC)) {
                    continue;
                }
                metadata(functionSymbol).ifPresent(info -> {
                    if (matches(info, functionSymbol.getName().get(), filter)) {
                        templates.add(toNode(functionSymbol.getName().get(), info, version));
                    }
                });
            }
        }
        templates.sort(Comparator.comparing(item -> ((AvailableNode) item).metadata().label()));
        if (templates.isEmpty()) {
            return List.of();
        }
        return List.of(new Category(new Metadata("Evaluation Templates",
                "Prebuilt AI evaluation functions", null, null, null, null, null, null), templates));
    }

    private boolean matches(TemplateInfo info, String functionName, String filter) {
        String searchTerm = filter == null ? "" : filter.toLowerCase(Locale.ROOT);
        return searchTerm.isBlank() || (info.label + " " + info.description + " " + info.kind + " " + functionName)
                .toLowerCase(Locale.ROOT).contains(searchTerm);
    }

    private AvailableNode toNode(String functionName, TemplateInfo info, String version) {
        Codedata codedata = new Codedata(NodeKind.EVAL_TEMPLATE, Constants.Ai.BALLERINA_ORG,
                TEMPLATE_PACKAGE, TEMPLATE_PACKAGE, null, functionName,
                version, null, null, null, null, null, true, false, null,
                Map.of("label", info.label, "description", info.description, "kind", info.kind,
                        "needsEvalset", info.needsEvalset));
        Metadata metadata = new Metadata(info.label, info.description, List.of(info.kind,
                info.needsEvalset ? "Uses evalset" : "No evalset"), null, null,
                Map.of("kind", info.kind, "needsEvalset", info.needsEvalset), null, null);
        return new AvailableNode(metadata, codedata, true);
    }

    private Optional<TemplateInfo> metadata(FunctionSymbol function) {
        for (AnnotationAttachmentSymbol attachment : function.annotAttachments()) {
            if (!TEMPLATE_ANNOTATION.equals(attachment.typeDescriptor().getName().orElse(null))) {
                continue;
            }
            Object value = attachment.attachmentValue().map(ConstantValue::value).orElse(null);
            if (!(value instanceof Map<?, ?> fields)) {
                return Optional.empty();
            }
            String label = value(fields.get("label"), function.getName().orElse("Evaluation template"));
            String description = value(fields.get("description"), "");
            String kind = value(fields.get("kind"), "RULE_BASED");
            boolean needsEvalset = Boolean.parseBoolean(value(fields.get("needsEvalset"), "false"));
            return Optional.of(new TemplateInfo(label, description, kind, needsEvalset));
        }
        return Optional.empty();
    }

    private String value(Object value, String defaultValue) {
        if (value instanceof ConstantValue constantValue) {
            value = constantValue.value();
        }
        return value == null ? defaultValue : String.valueOf(value).replace("\"", "");
    }

    private record TemplateInfo(String label, String description, String kind, boolean needsEvalset) {
    }
}
