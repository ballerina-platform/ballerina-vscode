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

package io.ballerina.artifactsgenerator.codemap;

import io.ballerina.compiler.syntax.tree.AnnotationNode;
import io.ballerina.compiler.syntax.tree.BasicLiteralNode;
import io.ballerina.compiler.syntax.tree.ClassDefinitionNode;
import io.ballerina.compiler.syntax.tree.ConstantDeclarationNode;
import io.ballerina.compiler.syntax.tree.DefaultableParameterNode;
import io.ballerina.compiler.syntax.tree.EnumDeclarationNode;
import io.ballerina.compiler.syntax.tree.ExpressionNode;
import io.ballerina.compiler.syntax.tree.FunctionDefinitionNode;
import io.ballerina.compiler.syntax.tree.FunctionSignatureNode;
import io.ballerina.compiler.syntax.tree.ImportDeclarationNode;
import io.ballerina.compiler.syntax.tree.ListenerDeclarationNode;
import io.ballerina.compiler.syntax.tree.MappingConstructorExpressionNode;
import io.ballerina.compiler.syntax.tree.MappingFieldNode;
import io.ballerina.compiler.syntax.tree.MarkdownDocumentationLineNode;
import io.ballerina.compiler.syntax.tree.MarkdownDocumentationNode;
import io.ballerina.compiler.syntax.tree.MetadataNode;
import io.ballerina.compiler.syntax.tree.ModuleVariableDeclarationNode;
import io.ballerina.compiler.syntax.tree.Node;
import io.ballerina.compiler.syntax.tree.NodeList;
import io.ballerina.compiler.syntax.tree.NodeTransformer;
import io.ballerina.compiler.syntax.tree.ObjectFieldNode;
import io.ballerina.compiler.syntax.tree.ParameterNode;
import io.ballerina.compiler.syntax.tree.QualifiedNameReferenceNode;
import io.ballerina.compiler.syntax.tree.RequiredParameterNode;
import io.ballerina.compiler.syntax.tree.RestParameterNode;
import io.ballerina.compiler.syntax.tree.SeparatedNodeList;
import io.ballerina.compiler.syntax.tree.ServiceDeclarationNode;
import io.ballerina.compiler.syntax.tree.SimpleNameReferenceNode;
import io.ballerina.compiler.syntax.tree.SpecificFieldNode;
import io.ballerina.compiler.syntax.tree.SyntaxKind;
import io.ballerina.compiler.syntax.tree.Token;
import io.ballerina.compiler.syntax.tree.TypeDefinitionNode;
import io.ballerina.compiler.syntax.tree.TypeDescriptorNode;
import io.ballerina.compiler.syntax.tree.TypeReferenceNode;
import io.ballerina.modelgenerator.commons.CommonUtils;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Transforms Ballerina syntax tree nodes into {@link CodeMapArtifact} instances.
 * @since 1.8.0
 */
class CodeMapNodeTransformer extends NodeTransformer<Optional<CodeMapArtifact>> {

    private static final String TYPE_FUNCTION = "FUNCTION";
    private static final String TYPE_SERVICE = "SERVICE";
    private static final String TYPE_IMPORT = "IMPORT";
    private static final String TYPE_LISTENER = "LISTENER";
    private static final String TYPE_VARIABLE = "VARIABLE";
    private static final String TYPE_TYPE = "TYPE";
    private static final String TYPE_CLASS = "CLASS";
    private static final String TYPE_FIELD = "FIELD";
    private static final String TYPE_INCLUSION = "TYPE_INCLUSION";

    private static final String PROP_PARAMETERS = "parameters";
    private static final String PROP_RETURNS = "returns";
    private static final String PROP_BASE_PATH = "basePath";
    private static final String PROP_ORG_NAME = "orgName";
    private static final String PROP_MODULE_NAME = "moduleName";
    private static final String PROP_ALIAS = "alias";
    private static final String PROP_TYPE = "type";
    private static final String PROP_TYPE_DESCRIPTOR = "typeDescriptor";
    private static final String PROP_VALUE = "value";
    private static final String PROP_ACCESSOR = "accessor";
    private static final String PROP_ANNOTATIONS = "annotations";
    private static final String PROP_LISTENER = "listener";

    private static final String RECORD_TYPE_NAME = "record";
    private static final String ENUM_TYPE_NAME = "enum";
    private static final String ALIAS_SEPARATOR = " as ";

    @Override
    public Optional<CodeMapArtifact> transform(FunctionDefinitionNode functionDefinitionNode) {
        CodeMapArtifact.Builder functionBuilder = new CodeMapArtifact.Builder(functionDefinitionNode);
        String functionName = functionDefinitionNode.functionName().text();

        functionBuilder.modifiers(extractModifiers(functionDefinitionNode.qualifierList()));
        functionBuilder.addProperty(PROP_PARAMETERS, extractParameters(functionDefinitionNode.functionSignature()));
        functionBuilder.addProperty(PROP_RETURNS, extractReturnType(functionDefinitionNode.functionSignature()));
        applyMetadata(functionBuilder, functionDefinitionNode.metadata());
        functionBuilder.type(TYPE_FUNCTION);

        if (functionDefinitionNode.kind() == SyntaxKind.RESOURCE_ACCESSOR_DEFINITION) {
            // Resource functions use path as name and HTTP method (get/post/...) as accessor
            String pathString = getPathString(functionDefinitionNode.relativeResourcePath());
            functionBuilder
                    .name(pathString.isEmpty() ? "/" : pathString)
                    .addProperty(PROP_ACCESSOR, functionName);
        } else {
            functionBuilder.name(functionName);
        }
        return Optional.of(functionBuilder.build());
    }

    @Override
    public Optional<CodeMapArtifact> transform(ServiceDeclarationNode serviceDeclarationNode) {
        CodeMapArtifact.Builder serviceBuilder = new CodeMapArtifact.Builder(serviceDeclarationNode);

        SeparatedNodeList<ExpressionNode> expressions = serviceDeclarationNode.expressions();
        ExpressionNode firstExpression = expressions.isEmpty() ? null : expressions.get(0);
        Optional<TypeDescriptorNode> typeDescriptorNode = serviceDeclarationNode.typeDescriptor();
        NodeList<Node> resourcePaths = serviceDeclarationNode.absoluteResourcePath();

        // Name resolves from type descriptor if present; falls back to listener expression for untyped services
        if (typeDescriptorNode.isPresent()) {
            serviceBuilder.name(typeDescriptorNode.get().toSourceCode().strip());
        } else if (resourcePaths.isEmpty() && firstExpression != null) {
            serviceBuilder.name(firstExpression.toSourceCode().strip());
        }

        serviceBuilder.addProperty(PROP_BASE_PATH,
                resourcePaths.isEmpty() ? "" : getPathString(resourcePaths));

        if (!expressions.isEmpty()) {
            Set<String> listeners = new LinkedHashSet<>();
            for (ExpressionNode expression : expressions) {
                String listenerSource = safeExtractSourceCode(expression);
                if (!listenerSource.isEmpty()) {
                    listeners.add(listenerSource);
                }
            }
            if (!listeners.isEmpty()) {
                serviceBuilder.addProperty(PROP_LISTENER, String.join(", ", listeners));
            }
        }

        serviceBuilder.type(TYPE_SERVICE);
        applyMetadata(serviceBuilder, serviceDeclarationNode.metadata());
        serviceDeclarationNode.members().forEach(member ->
                member.apply(this).ifPresent(serviceBuilder::addChild));

        return Optional.of(serviceBuilder.build());
    }

    @Override
    public Optional<CodeMapArtifact> transform(ImportDeclarationNode importDeclarationNode) {
        String orgName = importDeclarationNode.orgName()
                .map(org -> org.orgName().text())
                .orElse("");
        String moduleName = importDeclarationNode.moduleName().stream()
                .map(Token::text)
                .collect(Collectors.joining("."));
        Optional<String> alias = importDeclarationNode.prefix()
                .map(prefix -> prefix.prefix().text());

        String fullImportName = orgName.isEmpty() ? moduleName : orgName + "/" + moduleName;
        if (alias.isPresent()) {
            fullImportName += ALIAS_SEPARATOR + alias.get();
        }

        CodeMapArtifact.Builder importBuilder = new CodeMapArtifact.Builder(importDeclarationNode)
                .name(fullImportName)
                .type(TYPE_IMPORT);

        if (!orgName.isEmpty()) {
            importBuilder.addProperty(PROP_ORG_NAME, orgName);
        }
        importBuilder.addProperty(PROP_MODULE_NAME, moduleName);
        alias.ifPresent(a -> importBuilder.addProperty(PROP_ALIAS, a));

        return Optional.of(importBuilder.build());
    }

    @Override
    public Optional<CodeMapArtifact> transform(ListenerDeclarationNode listenerDeclarationNode) {
        CodeMapArtifact.Builder listenerBuilder = new CodeMapArtifact.Builder(listenerDeclarationNode)
                .name(listenerDeclarationNode.variableName().text())
                .type(TYPE_LISTENER);

        listenerDeclarationNode.typeDescriptor().ifPresent(typeDesc -> {
            String syntaxTypeString = typeDesc.toSourceCode().strip();
            if (!syntaxTypeString.isEmpty()) {
                listenerBuilder.addProperty(PROP_TYPE, syntaxTypeString);
            }
        });

        applyMetadata(listenerBuilder, listenerDeclarationNode.metadata());
        return Optional.of(listenerBuilder.build());
    }

    @Override
    public Optional<CodeMapArtifact> transform(ConstantDeclarationNode constantDeclarationNode) {
        CodeMapArtifact.Builder constantBuilder = new CodeMapArtifact.Builder(constantDeclarationNode)
                .name(constantDeclarationNode.variableName().text())
                .type(TYPE_VARIABLE);

        constantDeclarationNode.typeDescriptor().ifPresent(typeDesc ->
                constantBuilder.addProperty(PROP_TYPE_DESCRIPTOR, typeDesc.toSourceCode().strip()));
        constantBuilder.addProperty(PROP_VALUE, constantDeclarationNode.initializer().toSourceCode().strip());

        List<String> modifiers = new ArrayList<>();
        constantDeclarationNode.visibilityQualifier().ifPresent(v -> modifiers.add(v.text()));
        modifiers.add(constantDeclarationNode.constKeyword().text());
        constantBuilder.modifiers(modifiers);

        applyMetadata(constantBuilder, constantDeclarationNode.metadata());
        return Optional.of(constantBuilder.build());
    }

    @Override
    public Optional<CodeMapArtifact> transform(ModuleVariableDeclarationNode moduleVariableDeclarationNode) {
        CodeMapArtifact.Builder variableBuilder = new CodeMapArtifact.Builder(moduleVariableDeclarationNode)
                .name(CommonUtils.getVariableName(
                        moduleVariableDeclarationNode.typedBindingPattern().bindingPattern()));

        List<String> modifiers = new ArrayList<>();
        moduleVariableDeclarationNode.visibilityQualifier().ifPresent(v -> modifiers.add(v.text()));
        modifiers.addAll(extractModifiers(moduleVariableDeclarationNode.qualifiers()));
        variableBuilder.modifiers(modifiers);
        variableBuilder.type(TYPE_VARIABLE);

        TypeDescriptorNode typeDesc = moduleVariableDeclarationNode.typedBindingPattern().typeDescriptor();
        if (typeDesc != null) {
            String typeString = typeDesc.toSourceCode().strip();
            if (!typeString.isEmpty()) {
                // Configurables use PROP_TYPE_DESCRIPTOR so the renderer can emit the full type notation
                if (hasQualifier(moduleVariableDeclarationNode.qualifiers(), SyntaxKind.CONFIGURABLE_KEYWORD)) {
                    variableBuilder.addProperty(PROP_TYPE_DESCRIPTOR, typeString);
                } else {
                    variableBuilder.addProperty(PROP_TYPE, typeString);
                }
            }
        }

        applyMetadata(variableBuilder, moduleVariableDeclarationNode.metadata());
        return Optional.of(variableBuilder.build());
    }

    @Override
    public Optional<CodeMapArtifact> transform(TypeDefinitionNode typeDefinitionNode) {
        CodeMapArtifact.Builder typeBuilder = new CodeMapArtifact.Builder(typeDefinitionNode)
                .name(typeDefinitionNode.typeName().text())
                .type(TYPE_TYPE);

        typeDefinitionNode.visibilityQualifier().ifPresent(v -> typeBuilder.modifiers(List.of(v.text())));

        String typeDescriptor = extractTypeDescriptorFromSyntax(typeDefinitionNode);
        if (!typeDescriptor.isEmpty()) {
            typeBuilder.addProperty(PROP_TYPE_DESCRIPTOR, typeDescriptor);
        }

        applyMetadata(typeBuilder, typeDefinitionNode.metadata());
        return Optional.of(typeBuilder.build());
    }

    @Override
    public Optional<CodeMapArtifact> transform(EnumDeclarationNode enumDeclarationNode) {
        CodeMapArtifact.Builder typeBuilder = new CodeMapArtifact.Builder(enumDeclarationNode)
                .name(enumDeclarationNode.identifier().text())
                .type(TYPE_TYPE);

        enumDeclarationNode.qualifier().ifPresent(token -> {
            if (token.kind() == SyntaxKind.PUBLIC_KEYWORD) {
                typeBuilder.modifiers(List.of(token.text()));
            }
        });

        typeBuilder.addProperty(PROP_TYPE_DESCRIPTOR, ENUM_TYPE_NAME);
        applyMetadata(typeBuilder, enumDeclarationNode.metadata());
        return Optional.of(typeBuilder.build());
    }

    @Override
    public Optional<CodeMapArtifact> transform(ClassDefinitionNode classDefinitionNode) {
        CodeMapArtifact.Builder classBuilder = new CodeMapArtifact.Builder(classDefinitionNode)
                .name(classDefinitionNode.className().text())
                .type(TYPE_CLASS)
                .modifiers(extractModifiers(classDefinitionNode.visibilityQualifier(),
                        classDefinitionNode.classTypeQualifiers()));

        applyMetadata(classBuilder, classDefinitionNode.metadata());
        classDefinitionNode.members().forEach(member ->
                member.apply(this).ifPresent(classBuilder::addChild));

        return Optional.of(classBuilder.build());
    }

    @Override
    public Optional<CodeMapArtifact> transform(ObjectFieldNode objectFieldNode) {
        List<String> modifiers = new ArrayList<>();
        objectFieldNode.visibilityQualifier().ifPresent(token -> modifiers.add(token.text()));
        objectFieldNode.qualifierList().forEach(token -> modifiers.add(token.text()));

        CodeMapArtifact.Builder fieldBuilder = new CodeMapArtifact.Builder(objectFieldNode)
                .name(objectFieldNode.fieldName().text())
                .type(TYPE_FIELD)
                .modifiers(modifiers);

        fieldBuilder.addProperty(PROP_TYPE, objectFieldNode.typeName().toSourceCode().strip());
        return Optional.of(fieldBuilder.build());
    }

    @Override
    public Optional<CodeMapArtifact> transform(TypeReferenceNode typeReferenceNode) {
        String typeRefSource = safeExtractSourceCode(typeReferenceNode);
        if (typeRefSource.isEmpty()) {
            return Optional.empty();
        }
        return Optional.of(new CodeMapArtifact.Builder(typeReferenceNode)
                .name(typeRefSource)
                .type(TYPE_INCLUSION)
                .build());
    }

    @Override
    protected Optional<CodeMapArtifact> transformSyntaxNode(Node node) {
        return Optional.empty();
    }

    private void applyMetadata(CodeMapArtifact.Builder builder, Optional<MetadataNode> metadata) {
        extractDocumentation(metadata).ifPresent(builder::documentation);
        List<String> annotations = extractAnnotations(metadata);
        if (!annotations.isEmpty()) {
            builder.addProperty(PROP_ANNOTATIONS, annotations);
        }
    }

    private List<String> extractModifiers(Optional<Token> visibilityQualifier, NodeList<Token> classTypeQualifiers) {
        List<String> modifiers = new ArrayList<>();
        visibilityQualifier.ifPresent(token -> modifiers.add(token.text()));
        classTypeQualifiers.forEach(token -> modifiers.add(token.text()));
        return modifiers;
    }

    private List<String> extractModifiers(NodeList<Token> qualifierList) {
        return qualifierList.stream()
                .map(Token::text)
                .collect(Collectors.toList());
    }

    private List<String> extractParameters(FunctionSignatureNode functionSignature) {
        List<String> parameters = new ArrayList<>();
        if (functionSignature == null) {
            return parameters;
        }

        for (ParameterNode paramNode : functionSignature.parameters()) {
            if (paramNode == null) {
                continue;
            }
            String fullSource = safeExtractSourceCode(paramNode);
            if (!fullSource.isEmpty()) {
                parameters.add(fullSource);
            } else if (paramNode instanceof RequiredParameterNode requiredParam) {
                String paramType = safeExtractSourceCode(requiredParam.typeName());
                String paramName = requiredParam.paramName().map(name -> name.text()).orElse("");
                if (!paramType.isEmpty()) {
                    parameters.add(paramType + " " + paramName);
                }
            } else if (paramNode instanceof DefaultableParameterNode defaultableParam) {
                String paramType = safeExtractSourceCode(defaultableParam.typeName());
                String paramName = defaultableParam.paramName().map(name -> name.text()).orElse("");
                String defaultValue = safeExtractSourceCode(defaultableParam.expression());
                if (!paramType.isEmpty()) {
                    parameters.add(paramType + " " + paramName + " = " + defaultValue);
                }
            } else if (paramNode instanceof RestParameterNode restParam) {
                String paramType = safeExtractSourceCode(restParam.typeName());
                String paramName = restParam.paramName().map(name -> name.text()).orElse("");
                if (!paramType.isEmpty()) {
                    parameters.add(paramType + "... " + paramName);
                }
            }
        }
        return parameters;
    }

    private String extractReturnType(FunctionSignatureNode functionSignature) {
        return functionSignature.returnTypeDesc()
                .map(returnTypeDesc -> {
                    String fullReturnType = safeExtractSourceCode(returnTypeDesc);
                    if (!fullReturnType.isEmpty()) {
                        return fullReturnType.replaceFirst("^\\s*returns\\s+", "").strip();
                    }
                    return returnTypeDesc.type().toSourceCode().strip();
                })
                .orElse("()");
    }

    private String extractTypeDescriptorFromSyntax(TypeDefinitionNode typeDefinitionNode) {
        Node typeDescriptor = typeDefinitionNode.typeDescriptor();
        if (typeDescriptor == null) {
            return "";
        }
        String sourceCode = safeExtractSourceCode(typeDescriptor);

        // Truncate record body to "record" label — inline field details bloat the codeMap output
        if (sourceCode.contains("record {|") && sourceCode.contains("|}")) {
            int recordStart = sourceCode.indexOf("record {|");
            int recordEnd = sourceCode.indexOf("|}", recordStart);
            if (recordStart != -1 && recordEnd != -1) {
                String prefix = sourceCode.substring(0, recordStart);
                String suffix = sourceCode.substring(recordEnd + 2);
                return (prefix + RECORD_TYPE_NAME + suffix).trim();
            }
        }

        if (sourceCode.startsWith("record {") || sourceCode.startsWith("record{")) {
            return RECORD_TYPE_NAME;
        }
        return sourceCode;
    }

    private String safeExtractSourceCode(Node node) {
        if (node == null) {
            return "";
        }
        String sourceCode = node.toSourceCode();
        return sourceCode != null ? sourceCode.replaceAll("\\s+", " ").strip() : "";
    }

    private static String getPathString(NodeList<Node> nodes) {
        return nodes.stream()
                .map(node -> node.toString().trim())
                .collect(Collectors.joining());
    }

    private static boolean hasQualifier(NodeList<Token> qualifierList, SyntaxKind kind) {
        return qualifierList.stream().anyMatch(qualifier -> qualifier.kind() == kind);
    }

    private Optional<String> extractDocumentation(Optional<MetadataNode> metadata) {
        if (metadata.isEmpty()) {
            return Optional.empty();
        }
        return metadata.get().documentationString()
                .filter(node -> node instanceof MarkdownDocumentationNode)
                .map(node -> {
                    MarkdownDocumentationNode docNode = (MarkdownDocumentationNode) node;
                    StringBuilder description = new StringBuilder();
                    boolean firstLine = true;

                    for (Node documentationLine : docNode.documentationLines()) {
                        SyntaxKind lineKind = documentationLine.kind();
                        if (lineKind == SyntaxKind.MARKDOWN_DOCUMENTATION_LINE ||
                                lineKind == SyntaxKind.MARKDOWN_REFERENCE_DOCUMENTATION_LINE ||
                                lineKind == SyntaxKind.MARKDOWN_DEPRECATION_DOCUMENTATION_LINE ||
                                lineKind == SyntaxKind.MARKDOWN_PARAMETER_DOCUMENTATION_LINE ||
                                lineKind == SyntaxKind.MARKDOWN_RETURN_PARAMETER_DOCUMENTATION_LINE) {

                            if (!firstLine) {
                                description.append('\n');
                            }
                            firstLine = false;

                            StringBuilder lineContent = new StringBuilder();
                            if (documentationLine instanceof MarkdownDocumentationLineNode docLineNode) {
                                docLineNode.documentElements()
                                        .forEach(element -> lineContent.append(element.toSourceCode()));
                            } else {
                                lineContent.append(documentationLine.toSourceCode());
                            }
                            description.append(lineContent.toString());
                        }
                    }
                    return description.toString().strip();
                })
                .filter(doc -> !doc.isEmpty());
    }

    private List<String> extractAnnotations(Optional<MetadataNode> metadata) {
        if (metadata.isEmpty()) {
            return new ArrayList<>();
        }

        List<String> annotations = new ArrayList<>();
        for (AnnotationNode annotation : metadata.get().annotations()) {
            StringBuilder annotationStr = new StringBuilder("@");

            Node annotReference = annotation.annotReference();
            if (annotReference.kind() == SyntaxKind.QUALIFIED_NAME_REFERENCE) {
                QualifiedNameReferenceNode qNameRef = (QualifiedNameReferenceNode) annotReference;
                annotationStr.append(qNameRef.modulePrefix().text())
                        .append(":").append(qNameRef.identifier().text());
            } else if (annotReference.kind() == SyntaxKind.SIMPLE_NAME_REFERENCE) {
                annotationStr.append(((SimpleNameReferenceNode) annotReference).name().text());
            } else {
                annotationStr.append(annotReference.toSourceCode().strip());
            }

            annotation.annotValue().ifPresent(value ->
                    annotationStr.append(" {").append(extractAnnotationValue(value)).append("}"));

            annotations.add(annotationStr.toString());
        }
        return annotations;
    }

    private String extractAnnotationValue(MappingConstructorExpressionNode mappingNode) {
        List<String> fields = new ArrayList<>();
        for (MappingFieldNode field : mappingNode.fields()) {
            if (field instanceof SpecificFieldNode specificField) {
                String fieldName = specificField.fieldName().toSourceCode().strip();
                specificField.valueExpr().ifPresent(valueExpr ->
                        fields.add(fieldName + ": " + extractExpressionValue(valueExpr)));
            } else {
                fields.add(field.toSourceCode().strip());
            }
        }
        return String.join(", ", fields);
    }

    private String extractExpressionValue(ExpressionNode expression) {
        if (expression.kind() == SyntaxKind.STRING_LITERAL ||
                expression.kind() == SyntaxKind.BOOLEAN_LITERAL ||
                expression.kind() == SyntaxKind.NUMERIC_LITERAL) {
            return ((BasicLiteralNode) expression).literalToken().text();
        }
        return expression.toSourceCode().strip();
    }
}
