/*
 *  Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
 *
 *  WSO2 LLC. licenses this file to you under the Apache License,
 *  Version 2.0 (the "License"); you may not use this file except
 *  in compliance with the License.
 */

package io.ballerina.flowmodelgenerator.core.model.node;

import io.ballerina.flowmodelgenerator.core.model.Codedata;
import io.ballerina.flowmodelgenerator.core.model.NodeBuilder.TemplateContext;
import io.ballerina.flowmodelgenerator.core.model.NodeKind;
import io.ballerina.flowmodelgenerator.core.model.Property;
import io.ballerina.flowmodelgenerator.core.model.PropertyType;
import io.ballerina.modelgenerator.commons.FunctionData;

import java.util.List;
import java.util.Map;

/**
 * Builds the parameter form for an {@code @EvalTemplate} function.
 *
 * <p>The builder is a distinct node kind even though it uses regular function parameter construction. That lets the
 * AI evaluation form use the standard node-template API today, and leaves a compatible path for exposing templates
 * in the flow palette later.</p>
 *
 * @since 1.2.0
 */
public class EvalTemplateBuilder extends FunctionCall {

    private static final String CONVERSATION_THREAD_TYPE = "ConversationThread";
    private static final String AGENT_TYPE = "ai:Agent";
    private static final String MODEL_PROVIDER_TYPE = "ai:ModelProvider";
    private static final String DATA_SOURCE_PARAM_KEY = "dataSourceParam";
    private static final String DATA_SOURCE_KIND_KEY = "dataSourceKind";
    private static final String DATA_SOURCE_KIND_UNION = "union";
    private static final String DATA_SOURCE_KIND_STRICT = "strict";

    @Override
    public void setConcreteTemplateData(TemplateContext context) {
        super.setConcreteTemplateData(context);
        properties().removeProperty(Property.CONNECTION_KEY);
        properties().removeProperty(Property.CHECK_ERROR_KEY);
        properties().removeProperty(Property.VARIABLE_KEY);
        properties().removeProperty(Property.TYPE_KEY);

        Codedata codedata = context.codedata();
        Map<String, Object> data = codedata.data();
        if (data != null) {
            metadata().label(String.valueOf(data.getOrDefault("label", codedata.symbol())))
                    .description(String.valueOf(data.getOrDefault("description", "")))
                    .addData("kind", data.get("kind"))
                    .addData("needsEvalset", data.get("needsEvalset"));
        }

        Map<String, Property> props = properties().build();
        props.replaceAll((key, property) -> {
            List<PropertyType> types = property.types();
            boolean isConversationThread = types != null && types.stream()
                    .anyMatch(type -> String.valueOf(type.ballerinaType()).contains(CONVERSATION_THREAD_TYPE));
            if (isConversationThread) {
                boolean isUnion = types.stream().anyMatch(type -> String.valueOf(type.ballerinaType()).contains("|"));
                return Property.Builder.copyFrom(property)
                        .codedata()
                            .addData(DATA_SOURCE_PARAM_KEY, true)
                            .addData(DATA_SOURCE_KIND_KEY, isUnion ? DATA_SOURCE_KIND_UNION : DATA_SOURCE_KIND_STRICT)
                            .stepOut()
                        .hidden()
                        .build();
            }
            String primaryType = types == null || types.isEmpty() ? ""
                    : String.valueOf(types.getFirst().ballerinaType());
            if (primaryType.contains(AGENT_TYPE) || primaryType.contains(MODEL_PROVIDER_TYPE)) {
                return Property.Builder.copyFrom(property).clearTypes()
                        .type(Property.ValueType.EXPRESSION, primaryType).build();
            }
            return property;
        });
    }

    @Override
    protected NodeKind getFunctionNodeKind() {
        return NodeKind.EVAL_TEMPLATE;
    }

    @Override
    protected FunctionData.Kind getFunctionResultKind() {
        return FunctionData.Kind.FUNCTION;
    }
}
