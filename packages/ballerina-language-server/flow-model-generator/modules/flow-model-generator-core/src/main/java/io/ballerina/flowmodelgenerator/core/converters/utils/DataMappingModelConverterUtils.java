/*
 *  Copyright (c) 2025, WSO2 LLC. (http://www.wso2.com)
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

package io.ballerina.flowmodelgenerator.core.converters.utils;

import io.ballerina.compiler.api.symbols.Symbol;
import io.ballerina.compiler.syntax.tree.ArrayTypeDescriptorNode;
import io.ballerina.compiler.syntax.tree.Node;
import io.ballerina.compiler.syntax.tree.ParenthesisedTypeDescriptorNode;
import io.ballerina.compiler.syntax.tree.SyntaxInfo;
import io.ballerina.compiler.syntax.tree.SyntaxKind;
import io.ballerina.compiler.syntax.tree.TypeDescriptorNode;
import io.ballerina.compiler.syntax.tree.UnionTypeDescriptorNode;
import io.ballerina.modelgenerator.commons.PackageUtil;
import io.ballerina.projects.BuildOptions;
import io.ballerina.projects.Package;
import io.ballerina.projects.Project;
import io.ballerina.projects.ProjectException;
import io.ballerina.projects.directory.BuildProject;
import io.ballerina.projects.directory.SingleFileProject;
import io.ballerina.projects.util.ProjectUtils;
import org.apache.commons.lang3.math.NumberUtils;
import org.ballerinalang.langserver.commons.workspace.WorkspaceManager;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import static io.ballerina.flowmodelgenerator.core.converters.utils.Utils.escapeSpecialCharacters;
import static io.ballerina.flowmodelgenerator.core.converters.utils.Utils.unescapeUnicodeCodepoints;

/**
 * Common utility methods for data mapping model converters (XML and JSON to record converters).
 *
 * @since 1.3.0
 */
public final class DataMappingModelConverterUtils {

    private DataMappingModelConverterUtils() {
    }

    private static final String QUOTED_IDENTIFIER_PREFIX = "'";
    private static final String ESCAPE_NUMERIC_PATTERN = "\\b\\d.*";
    private static final List<String> KEYWORDS = SyntaxInfo.keywords();

    /**
     * This method returns the identifiers with special characters.
     *
     * @param identifier Identifier name.
     * @return {@link String} Special characters escaped identifier.
     */
    public static String escapeIdentifier(String identifier) {
        if (KEYWORDS.stream().anyMatch(identifier::equals)) {
            return "'" + identifier;
        } else {
            if (identifier.startsWith(QUOTED_IDENTIFIER_PREFIX)) {
                identifier = identifier.substring(1);
            }
            identifier = unescapeUnicodeCodepoints(identifier);
            identifier = escapeSpecialCharacters(identifier);
            if (identifier.matches(ESCAPE_NUMERIC_PATTERN)) {
                identifier = "\\" + identifier;
            }
            return identifier;
        }
    }

    /**
     * This method returns existing Types on a module/file(for single file projects).
     *
     * @param workspaceManager Workspace manager instance
     * @param filePath         FilePath URI of the/a file in a singleFileProject or module
     * @return {@link List<String>} List of already existing Types
     */
    public static List<String> getExistingTypeNames(WorkspaceManager workspaceManager, Path filePath) {
        List<String> existingTypeNames = new ArrayList<>();
        if (filePath == null) {
            return existingTypeNames;
        }

        if (workspaceManager != null && workspaceManager.semanticModel(filePath).isPresent()) {
            List<Symbol> moduleSymbols = workspaceManager.semanticModel(filePath).get().moduleSymbols();
            moduleSymbols.forEach(symbol -> {
                if (symbol.getName().isPresent()) {
                    existingTypeNames.add(symbol.getName().get());
                }
            });
            return existingTypeNames;
        }

        try {
            Project project;
            List<Symbol> moduleSymbols;
            Path projectRoot = ProjectUtils.findProjectRoot(filePath);
            if (projectRoot == null) {
                // Since the project-root cannot be found, the provided file is considered as SingleFileProject.
                project = PackageUtil.isOffline()
                        ? SingleFileProject.load(filePath, BuildOptions.builder().setOffline(true).build())
                        : SingleFileProject.load(filePath);
                Package currentPackage = project.currentPackage();
                moduleSymbols = PackageUtil.getCompilation(currentPackage)
                        .getSemanticModel(currentPackage.getDefaultModule().moduleId())
                        .moduleSymbols();
                moduleSymbols.forEach(symbol -> {
                    if (symbol.getName().isPresent()) {
                        existingTypeNames.add(symbol.getName().get());
                    }
                });
            } else {
                project = PackageUtil.isOffline()
                        ? BuildProject.load(projectRoot, BuildOptions.builder().setOffline(true).build())
                        : BuildProject.load(projectRoot);
                Package currentPackage = project.currentPackage();
                moduleSymbols = PackageUtil.getCompilation(currentPackage)
                        .getSemanticModel(currentPackage.getDefaultModule().moduleId())
                        .moduleSymbols();
                moduleSymbols.forEach(symbol -> {
                    if (symbol.getName().isPresent()) {
                        existingTypeNames.add(symbol.getName().get());
                    }
                });
            }
        } catch (ProjectException pe) {
            return existingTypeNames;
        }
        return existingTypeNames;
    }

    /**
     * This method extracts TypeDescriptorNodes within any UnionTypeDescriptorNodes or ParenthesisedTypeDescriptorNode.
     *
     * @param typeDescNodes List of Union and Parenthesised TypeDescriptorNodes
     * @return {@link List<TypeDescriptorNode>} Extracted SimpleNameReferenceNodes.
     */
    public static List<TypeDescriptorNode> extractTypeDescriptorNodes(List<TypeDescriptorNode> typeDescNodes) {
        List<TypeDescriptorNode> extractedTypeNames = new ArrayList<>();
        for (TypeDescriptorNode typeDescNode : typeDescNodes) {
            TypeDescriptorNode extractedTypeDescNode = extractParenthesisedTypeDescNode(typeDescNode);
            if (extractedTypeDescNode instanceof UnionTypeDescriptorNode unionTypeDescriptorNode) {
                List<TypeDescriptorNode> childTypeDescNodes =
                        List.of(unionTypeDescriptorNode.leftTypeDesc(),
                                unionTypeDescriptorNode.rightTypeDesc());
                addIfNotExist(extractedTypeNames, extractTypeDescriptorNodes(childTypeDescNodes));
            } else {
                addIfNotExist(extractedTypeNames, List.of(extractedTypeDescNode));
            }
        }
        return extractedTypeNames;
    }

    /**
     * This method returns the sorted TypeDescriptorNode list.
     *
     * @param typeDescriptorNodes List of TypeDescriptorNodes has to be sorted.
     * @return {@link List<TypeDescriptorNode>} The sorted TypeDescriptorNode list.
     */
    public static List<TypeDescriptorNode> sortTypeDescriptorNodes(List<TypeDescriptorNode> typeDescriptorNodes) {
        List<TypeDescriptorNode> nonArrayNodes = typeDescriptorNodes.stream()
                .filter(node -> !(node instanceof ArrayTypeDescriptorNode)).collect(Collectors.toList());
        List<TypeDescriptorNode> arrayNodes = typeDescriptorNodes.stream()
                .filter(node -> (node instanceof ArrayTypeDescriptorNode)).collect(Collectors.toList());
        List<TypeDescriptorNode> membersOfArrayNodes = arrayNodes.stream()
                .map(node -> extractArrayTypeDescNode((ArrayTypeDescriptorNode) node)).toList();
        nonArrayNodes.removeIf(node ->
                membersOfArrayNodes.stream().map(Node::toSourceCode).toList().contains(node.toSourceCode()));
        nonArrayNodes.sort(Comparator.comparing(TypeDescriptorNode::toSourceCode));
        arrayNodes.sort((node1, node2) -> {
            ArrayTypeDescriptorNode arrayNode1 = (ArrayTypeDescriptorNode) node1;
            ArrayTypeDescriptorNode arrayNode2 = (ArrayTypeDescriptorNode) node2;
            return getNumberOfDimensions(arrayNode1).equals(getNumberOfDimensions(arrayNode2)) ?
                    (arrayNode1).memberTypeDesc().toSourceCode()
                            .compareTo((arrayNode2).memberTypeDesc().toSourceCode()) :
                    getNumberOfDimensions(arrayNode1) - getNumberOfDimensions(arrayNode2);
        });
        return Stream.concat(nonArrayNodes.stream(), arrayNodes.stream()).toList();
    }

    /**
     * This method returns a list of TypeDescriptorNodes extracted from a UnionTypeDescriptorNode.
     *
     * @param typeDescNode UnionTypeDescriptorNode for which that has to be extracted.
     * @return {@link List<TypeDescriptorNode>} The list of extracted TypeDescriptorNodes.
     */
    public static List<TypeDescriptorNode> extractUnionTypeDescNode(TypeDescriptorNode typeDescNode) {
        List<TypeDescriptorNode> extractedTypeDescNodes = new ArrayList<>();
        TypeDescriptorNode extractedTypeDescNode = typeDescNode;
        if (typeDescNode.kind().equals(SyntaxKind.PARENTHESISED_TYPE_DESC)) {
            extractedTypeDescNode = extractParenthesisedTypeDescNode(typeDescNode);
        }
        if (extractedTypeDescNode.kind().equals(SyntaxKind.UNION_TYPE_DESC)) {
            UnionTypeDescriptorNode unionTypeDescNode = (UnionTypeDescriptorNode) extractedTypeDescNode;
            TypeDescriptorNode leftTypeDescNode = unionTypeDescNode.leftTypeDesc();
            TypeDescriptorNode rightTypeDescNode = unionTypeDescNode.rightTypeDesc();
            extractedTypeDescNodes.addAll(extractUnionTypeDescNode(leftTypeDescNode));
            extractedTypeDescNodes.addAll(extractUnionTypeDescNode(rightTypeDescNode));
        } else {
            extractedTypeDescNodes.add(extractedTypeDescNode);
        }
        return extractedTypeDescNodes;
    }

    /**
     * This method returns the number of dimensions of an ArrayTypeDescriptorNode.
     *
     * @param arrayNode ArrayTypeDescriptorNode for which the no. of dimensions has to be calculated.
     * @return {@link Integer} The total no. of dimensions of the ArrayTypeDescriptorNode.
     */
    public static Integer getNumberOfDimensions(ArrayTypeDescriptorNode arrayNode) {
        int totalDimensions = arrayNode.dimensions().size();
        if (arrayNode.memberTypeDesc() instanceof ArrayTypeDescriptorNode arrayTypeDescriptorNode) {
            totalDimensions += getNumberOfDimensions(arrayTypeDescriptorNode);
        }
        return totalDimensions;
    }

    /**
     * This method returns an alternative fieldName if the given fieldName already exists.
     *
     * @param fieldName          Field name
     * @param existingFieldNames The list of already existing field names
     * @param updatedFieldNames  The list of updated field names
     * @return {@link String} Updated field name
     */
    public static String getAndUpdateFieldNames(String fieldName, List<String> existingFieldNames,
                                                Map<String, String> updatedFieldNames) {
        String updatedFieldName = getUpdatedFieldName(fieldName, existingFieldNames, updatedFieldNames);
        if (!fieldName.equals(updatedFieldName)) {
            updatedFieldNames.put(fieldName, updatedFieldName);
            return updatedFieldName;
        }
        return fieldName;
    }

    /**
     * This method extracts the innermost member type from a nested ArrayTypeDescriptorNode.
     *
     * @param arrayTypeDescNode ArrayTypeDescriptorNode from which to extract the member type
     * @return {@link TypeDescriptorNode} The innermost member type descriptor
     */
    public static TypeDescriptorNode extractArrayTypeDescNode(ArrayTypeDescriptorNode arrayTypeDescNode) {
        if (arrayTypeDescNode.memberTypeDesc() instanceof ArrayTypeDescriptorNode arrayTypeDescriptorNode) {
            return extractArrayTypeDescNode(arrayTypeDescriptorNode);
        }
        return arrayTypeDescNode.memberTypeDesc();
    }

    private static TypeDescriptorNode extractParenthesisedTypeDescNode(TypeDescriptorNode typeDescNode) {
        if (typeDescNode instanceof ParenthesisedTypeDescriptorNode parenthesisedTypeDescriptorNode) {
            return extractParenthesisedTypeDescNode(parenthesisedTypeDescriptorNode.typedesc());
        }
        return typeDescNode;
    }

    private static void addIfNotExist(List<TypeDescriptorNode> typeDescNodes,
                                      List<TypeDescriptorNode> typeDescNodesToBeInserted) {
        for (TypeDescriptorNode typeDescNodeToBeInserted : typeDescNodesToBeInserted) {
            if (typeDescNodes.stream().noneMatch(typeDescNode -> typeDescNode.toSourceCode()
                    .equals(typeDescNodeToBeInserted.toSourceCode()))) {
                typeDescNodes.add(typeDescNodeToBeInserted);
            }
        }
    }

    private static String getUpdatedFieldName(String fieldName, List<String> existingFieldNames,
                                              Map<String, String> updatedFieldNames) {
        if (updatedFieldNames.containsKey(fieldName)) {
            return updatedFieldNames.get(fieldName);
        }
        if (!existingFieldNames.contains(fieldName) && !updatedFieldNames.containsValue(fieldName)) {
            return fieldName;
        } else {
            String[] fieldNameSplit = fieldName.split("_");
            String numericSuffix = fieldNameSplit[fieldNameSplit.length - 1];

            if (NumberUtils.isParsable(numericSuffix)) {
                return getUpdatedFieldName(String.join("_",
                                Arrays.copyOfRange(fieldNameSplit, 0, fieldNameSplit.length - 1)) + "_" +
                                String.format("%02d", Integer.parseInt(numericSuffix) + 1),
                        existingFieldNames, updatedFieldNames);
            } else {
                return getUpdatedFieldName(fieldName + "_01",
                        existingFieldNames, updatedFieldNames);
            }
        }
    }
}
