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

package io.ballerina.designmodelgenerator.core;

import io.ballerina.compiler.api.ModuleID;
import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.api.symbols.ClassSymbol;
import io.ballerina.compiler.api.symbols.IntersectionTypeSymbol;
import io.ballerina.compiler.api.symbols.ModuleSymbol;
import io.ballerina.compiler.api.symbols.ObjectTypeSymbol;
import io.ballerina.compiler.api.symbols.ParameterSymbol;
import io.ballerina.compiler.api.symbols.PathParameterSymbol;
import io.ballerina.compiler.api.symbols.ResourceMethodSymbol;
import io.ballerina.compiler.api.symbols.Symbol;
import io.ballerina.compiler.api.symbols.TypeDescKind;
import io.ballerina.compiler.api.symbols.TypeReferenceTypeSymbol;
import io.ballerina.compiler.api.symbols.TypeSymbol;
import io.ballerina.compiler.api.symbols.VariableSymbol;
import io.ballerina.compiler.api.symbols.resourcepath.PathRestParam;
import io.ballerina.compiler.api.symbols.resourcepath.PathSegmentList;
import io.ballerina.compiler.api.symbols.resourcepath.ResourcePath;
import io.ballerina.compiler.syntax.tree.AnnotationNode;
import io.ballerina.compiler.syntax.tree.BasicLiteralNode;
import io.ballerina.compiler.syntax.tree.ExpressionNode;
import io.ballerina.compiler.syntax.tree.MappingConstructorExpressionNode;
import io.ballerina.compiler.syntax.tree.MappingFieldNode;
import io.ballerina.compiler.syntax.tree.MetadataNode;
import io.ballerina.compiler.syntax.tree.ServiceDeclarationNode;
import io.ballerina.compiler.syntax.tree.SpecificFieldNode;
import io.ballerina.designmodelgenerator.core.model.ConnectionKind;

import java.util.Map;
import java.util.Optional;
import java.util.Random;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Common utility functions.
 *
 * @since 1.0.0
 */
public class CommonUtils {

    private static final String CENTRAL_ICON_URL = "https://bcentral-packageicons.azureedge.net/images/%s_%s_%s.png";
    private static final Pattern FULLY_QUALIFIED_MODULE_ID_PATTERN =
            Pattern.compile("(\\w+)/([\\w.]+):([^:]+):(\\w+)[|]?");
    private static final Random random = new Random();

    public static final String BALLERINA_ORG_NAME = "ballerina";
    public static final String BALLERINAX_ORG_NAME = "ballerinax";

    private static final String AI = "ai";
    private static final String AGENT = "Agent";
    private static final String MEMORY_TYPE_NAME = "Memory";
    private static final String ST_MEMORY_STORE_TYPE_NAME = "ShortTermMemoryStore";
    private static final String KNOWLEDGE_BASE_TYPE_NAME = "KnowledgeBase";
    private static final String FIXED_RETURN_AGENT_TYPE_NAME = "FixedReturnAgentType";
    private static final String INFERRED_RETURN_AGENT_TYPE_NAME = "InferredReturnAgentType";

    private static final String WSO2_MODEL_PROVIDER = "Wso2ModelProvider";
    private static final String WSO2_EMBEDDING_PROVIDER = "Wso2EmbeddingProvider";
    private static final String WSO2_ICON_SUFFIX = "?wso2_icon";

    private static final Map<String, ConnectionKind> CONNECTION_KIND_MAP = Map.of(
            "Agent", ConnectionKind.AGENT,
            "ModelProvider", ConnectionKind.MODEL_PROVIDER,
            "Wso2ModelProvider", ConnectionKind.MODEL_PROVIDER,
            "EmbeddingProvider", ConnectionKind.EMBEDDING_PROVIDER,
            "Wso2EmbeddingProvider", ConnectionKind.EMBEDDING_PROVIDER
    );

    /**
     * Get the raw type of the type descriptor. If the type descriptor is a type reference then return the associated
     * type descriptor.
     *
     * @param typeDescriptor type descriptor to evaluate
     * @return {@link TypeSymbol} extracted type descriptor
     */
    public static TypeSymbol getRawType(TypeSymbol typeDescriptor) {
        if (typeDescriptor.typeKind() == TypeDescKind.INTERSECTION) {
            return getRawType(((IntersectionTypeSymbol) typeDescriptor).effectiveTypeDescriptor());
        }
        if (typeDescriptor.typeKind() == TypeDescKind.TYPE_REFERENCE) {
            TypeReferenceTypeSymbol typeRef = (TypeReferenceTypeSymbol) typeDescriptor;
            if (typeRef.typeDescriptor().typeKind() == TypeDescKind.INTERSECTION) {
                return getRawType(((IntersectionTypeSymbol) typeRef.typeDescriptor()).effectiveTypeDescriptor());
            }
            TypeSymbol rawType = typeRef.typeDescriptor();
            if (rawType.typeKind() == TypeDescKind.TYPE_REFERENCE) {
                return getRawType(rawType);
            }
            return rawType;
        }
        return typeDescriptor;
    }

    /**
     * Generates the URL for the icon in the Ballerina central.
     *
     * @param moduleID the module ID
     */
    public static String generateIcon(ModuleID moduleID) {
        return String.format(CENTRAL_ICON_URL, moduleID.orgName(), moduleID.packageName(), moduleID.version());
    }

    /**
     * Generates the icon URL for the given type symbol. If the module symbol is not present, the icon will not be
     * generated.
     *
     * @param typeSymbol the type symbol
     * @return the icon URL or null if the module symbol is not present
     */
    public static String generateIcon(TypeSymbol typeSymbol) {
        String typeName = getTypeName(typeSymbol);
        String iconUrl = typeSymbol.getModule().map(moduleSymbol ->
                generateIcon(moduleSymbol.id())).orElse(null);

        if (iconUrl != null && (WSO2_MODEL_PROVIDER.equals(typeName) || WSO2_EMBEDDING_PROVIDER.equals(typeName))) {
            return iconUrl + WSO2_ICON_SUFFIX;
        }

        return iconUrl;
    }

    public static String generateUUID() {
        return new UUID(random.nextLong(), random.nextLong()).toString();
    }

    /**
     * Returns the processed type signature of the type symbol. It removes the organization and the package, and checks
     * if it is the default module which will remove the prefix.
     *
     * @param typeSymbol the type symbol
     * @param moduleInfo the default module name descriptor
     * @return the processed type signature
     */
    public static String getTypeSignature(TypeSymbol typeSymbol, ModuleInfo moduleInfo) {
        String text = typeSymbol.signature();
        StringBuilder newText = new StringBuilder();
        Matcher matcher = FULLY_QUALIFIED_MODULE_ID_PATTERN.matcher(text);
        int nextStart = 0;
        while (matcher.find()) {
            // Append up-to start of the match
            newText.append(text, nextStart, matcher.start(1));

            String modPart = matcher.group(2);
            int last = modPart.lastIndexOf(".");
            if (last != -1) {
                modPart = modPart.substring(last + 1);
            }

            String typeName = matcher.group(4);

            if (!modPart.equals(moduleInfo.packageName())) {
                newText.append(modPart);
                newText.append(":");
            }
            newText.append(typeName);
            // Update next-start position
            nextStart = matcher.end(4);
        }
        // Append the remaining
        if (nextStart != 0 && nextStart < text.length()) {
            newText.append(text.substring(nextStart));
        }
        return !newText.isEmpty() ? newText.toString() : text;
    }

    public record ModuleInfo(String org, String packageName, String moduleName, String version) {

        public static ModuleInfo from(ModuleID moduleId) {
            return new ModuleInfo(moduleId.orgName(), moduleId.packageName(), moduleId.moduleName(),
                    moduleId.version());
        }
    }

    /**
     * Returns the resource path string for the given resource method symbol.
     *
     * @param semanticModel        the semantic model
     * @param resourceMethodSymbol the resource method symbol
     * @return the resource path string
     */
    public static String getResourcePathStr(SemanticModel semanticModel,
                                            ResourceMethodSymbol resourceMethodSymbol) {

        io.ballerina.modelgenerator.commons.ModuleInfo moduleInfo;
        if (resourceMethodSymbol.getName().isPresent()) {
            moduleInfo = io.ballerina.modelgenerator.commons.ModuleInfo.from(
                    resourceMethodSymbol.getModule().get().id());
        } else {
            moduleInfo = null;
        }

        StringBuilder pathBuilder = new StringBuilder();
        ResourcePath resourcePath = resourceMethodSymbol.resourcePath();
        switch (resourcePath.kind()) {
            case PATH_SEGMENT_LIST -> {
                PathSegmentList pathSegmentList = (PathSegmentList) resourcePath;
                boolean isFirstElement = true;
                for (Symbol pathSegment : pathSegmentList.list()) {
                    if (isFirstElement) {
                        isFirstElement = false;
                    } else {
                        pathBuilder.append("/");
                    }
                    if (pathSegment instanceof PathParameterSymbol pathParameterSymbol) {
                        String type = io.ballerina.modelgenerator.commons.CommonUtils.getTypeSignature(semanticModel,
                                pathParameterSymbol.typeDescriptor(), true, moduleInfo);
                        pathBuilder.append("[").append(type);
                        String paramName = pathParameterSymbol.getName().orElse("");
                        if (!paramName.isEmpty()) {
                            pathBuilder.append(" ").append(paramName);
                        }
                        pathBuilder.append("]");
                    } else {
                        pathBuilder.append(pathSegment.getName().orElse(""));
                    }
                }
                ((PathSegmentList) resourcePath).pathRestParameter().ifPresent(pathRestParameter -> {
                    String type = io.ballerina.modelgenerator.commons.CommonUtils.getTypeSignature(semanticModel,
                            pathRestParameter.typeDescriptor(), true, moduleInfo);
                    pathBuilder.append("[").append(type).append("...");
                    if (!pathRestParameter.isTypeOnlyParam()) {
                        pathBuilder.append(" ").append(pathRestParameter.getName().orElse(""));
                    }
                    pathBuilder.append("]");
                });
            }
            case PATH_REST_PARAM -> {
                PathParameterSymbol pathRestParameter = ((PathRestParam) resourcePath).parameter();
                String type = io.ballerina.modelgenerator.commons.CommonUtils.getTypeSignature(semanticModel,
                        pathRestParameter.typeDescriptor(), true, moduleInfo);
                pathBuilder.append("[").append(type).append("...");
                if (!pathRestParameter.isTypeOnlyParam()) {
                    pathBuilder.append(" ").append(pathRestParameter.getName().orElse(""));
                }
                pathBuilder.append("]");
            }
            case DOT_RESOURCE_PATH -> pathBuilder.append(".");
        }
        return pathBuilder.toString();
    }

    private static ClassSymbol getClassSymbol(Symbol symbol) {
        if (symbol instanceof ClassSymbol classSymbol) {
            return classSymbol;
        }
        TypeSymbol typeDescriptor;
        if (symbol instanceof VariableSymbol variableSymbol) {
            typeDescriptor = variableSymbol.typeDescriptor();
        } else if (symbol instanceof ParameterSymbol parameterSymbol) {
            typeDescriptor = parameterSymbol.typeDescriptor();
        } else {
            return null;
        }
        if (typeDescriptor instanceof TypeReferenceTypeSymbol typeRef
                && typeRef.typeDescriptor() instanceof ClassSymbol classSymbol) {
            return classSymbol;
        }
        return null;
    }

    public static boolean isAgentClass(Symbol symbol) {
        Optional<ModuleSymbol> optModule = symbol.getModule();
        if (optModule.isEmpty()) {
            return false;
        }
        ModuleID id = optModule.get().id();
        if (!isAiModule(id.orgName(), id.packageName())) {
            return false;
        }
        return symbol.getName().isPresent() && symbol.getName().get().equals(AGENT);
    }

    public static boolean isAiFixedReturnAgent(Symbol symbol) {
        ClassSymbol classSymbol = getClassSymbol(symbol);
        return classSymbol != null && hasAiTypeInclusion(classSymbol, FIXED_RETURN_AGENT_TYPE_NAME);
    }

    public static boolean isAiInferredReturnAgent(Symbol symbol) {
        ClassSymbol classSymbol = getClassSymbol(symbol);
        return classSymbol != null && hasAiTypeInclusion(classSymbol, INFERRED_RETURN_AGENT_TYPE_NAME);
    }

    public static boolean isAiMemory(Symbol symbol) {
        ClassSymbol classSymbol = getClassSymbol(symbol);
        return classSymbol != null && (hasAiTypeInclusion(classSymbol, MEMORY_TYPE_NAME));
    }

    public static boolean isAiShortTermMemoryStore(Symbol symbol) {
        ClassSymbol classSymbol = getClassSymbol(symbol);
        return classSymbol != null && (hasAiTypeInclusion(classSymbol, ST_MEMORY_STORE_TYPE_NAME));
    }

    public static boolean isAiKnowledgeBase(Symbol symbol) {
        if (symbol instanceof ObjectTypeSymbol objectTypeSymbol) {
            return hasAiTypeInclusion(objectTypeSymbol, KNOWLEDGE_BASE_TYPE_NAME);
        }
        ClassSymbol classSymbol = getClassSymbol(symbol);
        return classSymbol != null && hasAiTypeInclusion(classSymbol, KNOWLEDGE_BASE_TYPE_NAME);
    }

    public static boolean isHiddenAiClass(Symbol symbol) {
        return isAgentClass(symbol) || isAiFixedReturnAgent(symbol) || isAiInferredReturnAgent(symbol)
                || isAiKnowledgeBase(symbol) || isAiMemory(symbol) || isAiShortTermMemoryStore(symbol);
    }

    private static boolean hasAiTypeInclusion(ObjectTypeSymbol objectTypeSymbol, String includedTypeName) {
        return objectTypeSymbol.typeInclusions().stream()
                .filter(typeSymbol -> typeSymbol instanceof TypeReferenceTypeSymbol)
                .map(typeSymbol -> (TypeReferenceTypeSymbol) typeSymbol)
                .filter(typeRef -> typeRef.definition().nameEquals(includedTypeName))
                .map(TypeSymbol::getModule)
                .filter(Optional::isPresent)
                .map(Optional::get)
                .anyMatch(moduleId -> BALLERINA_ORG_NAME.equals(moduleId.id().orgName()) &&
                        AI.equals(moduleId.id().moduleName()));
    }

    public static boolean isAiModule(String org, String module) {
        return (BALLERINAX_ORG_NAME.equals(org) || BALLERINA_ORG_NAME.equals(org)) && module.equals(AI);
    }

    public static String getTypeName(TypeSymbol typeSymbol) {
        return typeSymbol.getName().orElse(typeSymbol.signature());
    }

    public static ConnectionKind getConnectionKind(TypeSymbol typeSymbol) {
        String typeName = getTypeName(typeSymbol);
        return CONNECTION_KIND_MAP.getOrDefault(typeName, ConnectionKind.CONNECTION);
    }

    /**
     * Extracts a field value from a service annotation. Traverses the annotation's mapping constructor expression to
     * find the specified field.
     *
     * @param serviceNode the service declaration node
     * @param fieldName   the field name to extract (e.g., "queueName", "topicName")
     * @return Optional containing the field value if found, empty otherwise
     */
    public static Optional<String> extractServiceAnnotationField(ServiceDeclarationNode serviceNode,
                                                                 String fieldName) {
        Optional<MetadataNode> metadata = serviceNode.metadata();
        if (metadata.isEmpty()) {
            return Optional.empty();
        }

        // Iterate through annotations to find the service config annotation
        for (AnnotationNode annotation : metadata.get().annotations()) {
            Optional<MappingConstructorExpressionNode> annotValue = annotation.annotValue();
            if (annotValue.isEmpty()) {
                continue;
            }

            MappingConstructorExpressionNode mappingNode = annotValue.get();

            // Parse the mapping constructor to find the specified field
            for (MappingFieldNode field : mappingNode.fields()) {
                if (field instanceof SpecificFieldNode specificField) {
                    String currentFieldName = specificField.fieldName().toString().trim();

                    if (fieldName.equals(currentFieldName)) {
                        Optional<ExpressionNode> valueExpr = specificField.valueExpr();
                        if (valueExpr.isEmpty()) {
                            return Optional.empty();
                        }
                        String value = "";
                        ExpressionNode expr = valueExpr.get();
                        if (expr instanceof BasicLiteralNode literalNode) {
                            value = literalNode.literalToken().text().trim();
                            // Removes quotes
                            value = value.replaceAll("^\"|\"$", "");
                        } else {
                            // Handles variables etc
                            value = expr.toSourceCode().trim();
                        }
                        if (!value.isEmpty()) {
                            return Optional.of(value);
                        }
                        // So - doesnt get appended when value is empty
                        return Optional.empty();
                    }
                }
            }
        }
        return Optional.empty();
    }
}
