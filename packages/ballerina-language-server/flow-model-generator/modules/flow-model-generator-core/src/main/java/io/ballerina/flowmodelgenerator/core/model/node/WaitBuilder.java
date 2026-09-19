/*
 *  Copyright (c) 2024, WSO2 LLC. (http://www.wso2.com)
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

package io.ballerina.flowmodelgenerator.core.model.node;

import com.google.gson.Gson;
import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.api.symbols.Symbol;
import io.ballerina.compiler.api.symbols.TypeSymbol;
import io.ballerina.compiler.api.symbols.UnionTypeSymbol;
import io.ballerina.compiler.api.symbols.VariableSymbol;
import io.ballerina.compiler.api.symbols.WorkerSymbol;
import io.ballerina.compiler.syntax.tree.SyntaxKind;
import io.ballerina.flowmodelgenerator.core.model.FormBuilder;
import io.ballerina.flowmodelgenerator.core.model.NodeBuilder;
import io.ballerina.flowmodelgenerator.core.model.NodeKind;
import io.ballerina.flowmodelgenerator.core.model.Property;
import io.ballerina.flowmodelgenerator.core.model.SourceBuilder;
import io.ballerina.modelgenerator.commons.CommonUtils;
import io.ballerina.projects.Document;
import org.eclipse.lsp4j.TextEdit;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

/**
 * Represents the properties of a wait node.
 *
 * @since 1.0.0
 */
public class WaitBuilder extends NodeBuilder {

    public static final String LABEL = "Wait";
    public static final String DESCRIPTION = "Wait for a set of futures to complete";

    public static final String FUTURES_KEY = "futures";
    public static final String FUTURE_LABEL = "Future";
    public static final String FUTURE_DOC = "The future to wait for";

    public static final String FUTURE_TYPE_BALLERINA_TYPE = "future<any|error>";

    private static final Gson gson = new Gson();

    @Override
    public void setConcreteConstData() {
        metadata().label(LABEL).description(DESCRIPTION);
        codedata().node(NodeKind.WAIT);
    }

    @Override
    public void setConcreteTemplateData(TemplateContext context) {
        properties()
                .futures(futureTemplate())
                .dataVariable(null, Property.VARIABLE_NAME, Property.TYPE_DOC, Property.VARIABLE_DOC,
                        true, context.getAllVisibleSymbolNames(), true);
    }

    @Override
    public Map<Path, List<TextEdit>> toSource(SourceBuilder sourceBuilder) {
        Optional<Property> futures = sourceBuilder.getProperty(FUTURES_KEY);
        Optional<Property> variable = sourceBuilder.getProperty(Property.VARIABLE_KEY);
        if (futures.isEmpty() || !(futures.get().value() instanceof Map<?, ?> futureMap)) {
            throw new IllegalStateException("Wait node does not have futures to wait for");
        }

        if (variable.isEmpty()) {
            throw new IllegalStateException("Wait node does not have a variable to assign the result to");
        }

        try {
            sourceBuilder.workspaceManager.loadProject(sourceBuilder.filePath);
        } catch (Exception e) {
            throw new IllegalStateException("Failed to load the project for the given file path: "
                    + sourceBuilder.filePath, e);
        }

        Optional<Document> document = sourceBuilder.workspaceManager.document(sourceBuilder.filePath);
        if (document.isEmpty()) {
            throw new IllegalStateException("Document not found for the given file path: " + sourceBuilder.filePath);
        }

        if (semanticModel == null) {
            Optional<SemanticModel> model = sourceBuilder.workspaceManager.semanticModel(sourceBuilder.filePath);
            if (model.isEmpty()) {
                throw new IllegalStateException("Semantic model not found for the given file path: "
                        + sourceBuilder.filePath);
            }
            semanticModel = model.get();
        }

        Optional<Property> type = sourceBuilder.getProperty(Property.TYPE_KEY);
        String typeSignature = "";
        if (type.isPresent()) {
            String sourceCode = type.get().toSourceCode();
            if (!sourceCode.startsWith("map<") && !sourceCode.endsWith(">")) {
                typeSignature = sourceCode;
            }
        }

        List<String> keyValuePairs = new ArrayList<>();
        List<String> expressions = new ArrayList<>();
        futureMap.forEach((keyObj, valueObj) -> {
            String key = (String) keyObj;
            String expression = Property.convertToProperty(valueObj).toSourceCode();
            if (!expression.isEmpty()) {
                keyValuePairs.add(key + ": " + expression);
                expressions.add(expression);
            }
        });

        if (typeSignature.isEmpty()) {
            List<Symbol> symbols = semanticModel.visibleSymbols(document.get(),
                    sourceBuilder.flowNode.codedata().lineRange().startLine());

            TypeSymbol[] workerAndAsyncSymbols = symbols.stream()
                    .filter(symbol -> expressions.contains(symbol.getName().orElse("")))
                    .map(symbol -> {
                        if (symbol instanceof WorkerSymbol workerSymbol) {
                            return workerSymbol.returnType();
                        } else if (symbol instanceof VariableSymbol variableSymbol) {
                            return variableSymbol.typeDescriptor();
                        }
                        return null;
                    })
                    .filter(Objects::nonNull)
                    .distinct()
                    .sorted(Comparator.comparing(t -> t.getName().orElse("")))
                    .toArray(TypeSymbol[]::new);

            if (workerAndAsyncSymbols.length != 0) {
                UnionTypeSymbol build = semanticModel.types().builder().UNION_TYPE
                        .withMemberTypes(workerAndAsyncSymbols).build();

                typeSignature = CommonUtils.getTypeSignature(semanticModel, build, false);
                typeSignature = "map<" + typeSignature + ">";
            } else {
                typeSignature = "map<any|error>";
            }
        }

        sourceBuilder.token().name(CommonUtils.escapeTypeSignatureModulePrefixes(typeSignature))
                .whiteSpace()
                .expression(variable.get())
                .whiteSpace()
                .keyword(SyntaxKind.EQUAL_TOKEN)
                .keyword(SyntaxKind.WAIT_KEYWORD)
                .keyword(SyntaxKind.OPEN_BRACE_TOKEN)
                .name(String.join(", ", keyValuePairs))
                .keyword(SyntaxKind.CLOSE_BRACE_TOKEN);

        return sourceBuilder.token().endOfStatement().stepOut().textEdit().build();
    }

    public static Property futureTemplate() {
        return new FormBuilder<>(null, null, null, null)
                .futureTemplate()
                .build()
                .get(FUTURES_KEY);
    }
}
