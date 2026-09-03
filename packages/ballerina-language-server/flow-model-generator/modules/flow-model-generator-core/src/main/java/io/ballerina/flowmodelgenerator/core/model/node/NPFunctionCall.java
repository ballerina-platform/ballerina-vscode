package io.ballerina.flowmodelgenerator.core.model.node;

import io.ballerina.flowmodelgenerator.core.Constants;
import io.ballerina.flowmodelgenerator.core.model.Codedata;
import io.ballerina.flowmodelgenerator.core.model.FormBuilder;
import io.ballerina.flowmodelgenerator.core.model.NodeBuilder;
import io.ballerina.flowmodelgenerator.core.model.NodeKind;
import io.ballerina.flowmodelgenerator.core.model.Property;
import io.ballerina.flowmodelgenerator.core.utils.ParamUtils;
import io.ballerina.modelgenerator.commons.CommonUtils;
import io.ballerina.modelgenerator.commons.FunctionData;
import io.ballerina.modelgenerator.commons.FunctionDataBuilder;
import io.ballerina.modelgenerator.commons.ModuleInfo;
import io.ballerina.modelgenerator.commons.ParameterData;
import io.ballerina.projects.Module;

public class NPFunctionCall extends FunctionCall {

    public static final String LABEL = "Call Natural Function";
    public static final String DESCRIPTION = "Call a natural programming function";

    @Override
    protected NodeKind getFunctionNodeKind() {
        return NodeKind.NP_FUNCTION_CALL;
    }

    @Override
    protected FunctionData.Kind getFunctionResultKind() {
        return super.getFunctionResultKind();
    }

    // module is intentionally unused: PARAM_FOR_TYPE_INFER and INCLUDED_RECORD parameters are skipped
    // for NP functions, so the record-field-selector logic that requires a Module is never reached here.
    // The parameter is kept to match the parent-class API.
    @Override
    protected void setParameterProperties(FunctionData function, Module module) {
        boolean hasOnlyRestParams = function.parameters().size() == 1;
        for (ParameterData paramResult : function.parameters().values()) {
            if (paramResult.kind().equals(ParameterData.Kind.PARAM_FOR_TYPE_INFER)
                    || paramResult.kind().equals(ParameterData.Kind.INCLUDED_RECORD)) {
                continue;
            }

            if (isPromptParam(paramResult)) {
                continue;
            }

            String unescapedParamName = ParamUtils.removeLeadingSingleQuote(paramResult.name());
            Property.Builder<FormBuilder<NodeBuilder>> customPropBuilder = properties().custom();
            customPropBuilder
                    .metadata()
                        .label(unescapedParamName)
                        .description(paramResult.description())
                        .stepOut()
                    .codedata()
                        .kind(paramResult.kind().name())
                        .originalName(paramResult.name())
                        .stepOut()
                    .placeholder(paramResult.placeholder())
                    .defaultValue(paramResult.defaultValue())
                    .imports(paramResult.importStatements())
                    .editable()
                    .optional(paramResult.optional())
                    .advanced(paramResult.advanced());

            switch (paramResult.kind()) {
                case INCLUDED_RECORD_REST -> {
                    if (hasOnlyRestParams) {
                        customPropBuilder.optional(false);
                    }
                    unescapedParamName = "additionalValues";
                    Property template = customPropBuilder.buildRepeatableTemplates(paramResult.typeSymbol(),
                            semanticModel, moduleInfo);
                    customPropBuilder.type()
                            .fieldType(Property.ValueType.REPEATABLE_MAP)
                            .ballerinaType(paramResult.type())
                            .template(template)
                            .selected(true)
                            .stepOut();
                }
                case REST_PARAMETER -> {
                    if (hasOnlyRestParams) {
                        customPropBuilder.optional(false);
                    }
                    Property template = customPropBuilder.buildRepeatableTemplates(paramResult.typeSymbol(),
                            semanticModel, moduleInfo);
                    customPropBuilder.type()
                            .fieldType(Property.ValueType.REPEATABLE_LIST)
                            .ballerinaType(paramResult.type())
                            .template(template)
                            .selected(true)
                            .stepOut();
                }
                default -> customPropBuilder.typeWithExpression(paramResult.typeSymbol(), moduleInfo);
            }

            customPropBuilder
                    .stepOut()
                    .addProperty(unescapedParamName);
        }
    }

    @Override
    public void setConcreteTemplateData(TemplateContext context) {
        Codedata codedata = context.codedata();

        ModuleInfo targetModuleInfo = new ModuleInfo(codedata.org(), codedata.packageName(), codedata.module(),
                codedata.version());
        FunctionDataBuilder functionDataBuilder = new FunctionDataBuilder()
                .name(codedata.symbol())
                .moduleInfo(targetModuleInfo)
                .functionResultKind(getFunctionResultKind())
                .userModuleInfo(moduleInfo)
                .workspaceManager(context.workspaceManager())
                .filePath(context.filePath());
        FunctionData functionData = functionDataBuilder.build();

        metadata()
                .label(functionData.name())
                .description(functionData.description());
        codedata()
                .id(functionData.functionId())
                .node(getFunctionNodeKind())
                .org(codedata.org())
                .module(codedata.module())
                .object(codedata.object())
                .version(codedata.version())
                .symbol(codedata.symbol());
        Module module = context.workspaceManager().module(context.filePath()).orElse(null);
        setParameterProperties(functionData, module);

        String returnTypeName = functionData.returnType();
        if (CommonUtils.hasReturn(functionData.returnType())) {
            properties()
                    .type(returnTypeName, functionData.inferredReturnType(), functionData.importStatements(), false)
                    .data(returnTypeName, context.getAllVisibleSymbolNames(), Property.RESULT_NAME,
                            Property.RESULT_DOC, false);
        }

        if (functionData.returnError()) {
            properties().checkError(true);
        }
    }

    public static boolean isPromptParam(ParameterData parameterData) {
        return parameterData.name().equals(Constants.NaturalFunctions.PROMPT)
                && parameterData.type().equals(Constants.NaturalFunctions.MODULE_PREFIXED_PROMPT_TYPE);
    }
}
