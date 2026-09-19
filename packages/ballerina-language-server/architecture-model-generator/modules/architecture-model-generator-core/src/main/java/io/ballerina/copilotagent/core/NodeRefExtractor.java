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

package io.ballerina.copilotagent.core;

import io.ballerina.compiler.syntax.tree.ClassDefinitionNode;
import io.ballerina.compiler.syntax.tree.ConstantDeclarationNode;
import io.ballerina.compiler.syntax.tree.EnumDeclarationNode;
import io.ballerina.compiler.syntax.tree.FunctionDefinitionNode;
import io.ballerina.compiler.syntax.tree.ImportDeclarationNode;
import io.ballerina.compiler.syntax.tree.ListenerDeclarationNode;
import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.compiler.syntax.tree.ModuleVariableDeclarationNode;
import io.ballerina.compiler.syntax.tree.Node;
import io.ballerina.compiler.syntax.tree.NodeList;
import io.ballerina.compiler.syntax.tree.NodeVisitor;
import io.ballerina.compiler.syntax.tree.ServiceDeclarationNode;
import io.ballerina.compiler.syntax.tree.TypeDefinitionNode;
import io.ballerina.copilotagent.core.models.STNodeRefMap;
import io.ballerina.modelgenerator.commons.CommonUtils;

import java.util.stream.Collectors;

/**
 * Visitor to extract node references and populate the STNodeRefMap.
 *
 * @since 1.5.0
 */
public class NodeRefExtractor extends NodeVisitor {

    private final STNodeRefMap nodeRefMap;

    public NodeRefExtractor(STNodeRefMap nodeRefMap) {
        this.nodeRefMap = nodeRefMap;
    }

    @Override
    public void visit(ModulePartNode modulePartNode) {
        modulePartNode.imports().forEach(importNode -> importNode.accept(this));
        modulePartNode.members().forEach(member -> member.accept(this));
    }

    @Override
    public void visit(ListenerDeclarationNode listenerDeclarationNode) {
        String key = listenerDeclarationNode.variableName().text().trim();
        this.nodeRefMap.putListenerNode(key, listenerDeclarationNode);
    }

    @Override
    public void visit(ServiceDeclarationNode serviceDeclarationNode) {
        String key = getPath(serviceDeclarationNode.absoluteResourcePath()) + "#" +
                     serviceDeclarationNode.expressions();
        this.nodeRefMap.putServiceNode(key, serviceDeclarationNode);
    }

    @Override
    public void visit(FunctionDefinitionNode functionDefinitionNode) {
        String key = functionDefinitionNode.functionName().text().trim();
        this.nodeRefMap.putFunctionNode(key, functionDefinitionNode);
    }

    @Override
    public void visit(TypeDefinitionNode typeDefinitionNode) {
        String key = typeDefinitionNode.typeName().text().trim();
        this.nodeRefMap.putTypeDefNode(key, typeDefinitionNode);
    }

    @Override
    public void visit(ModuleVariableDeclarationNode moduleVariableDeclarationNode) {
        String key = CommonUtils.getVariableName(
                moduleVariableDeclarationNode.typedBindingPattern().bindingPattern());
        this.nodeRefMap.putModuleVarNode(key, moduleVariableDeclarationNode);
    }

    @Override
    public void visit(ConstantDeclarationNode constantDeclarationNode) {
        String key = constantDeclarationNode.variableName().text().trim();
        this.nodeRefMap.putConstantNode(key, constantDeclarationNode);
    }

    @Override
    public void visit(EnumDeclarationNode enumDeclarationNode) {
        String key = enumDeclarationNode.identifier().text().trim();
        this.nodeRefMap.putEnumNode(key, enumDeclarationNode);
    }

    @Override
    public void visit(ClassDefinitionNode classDefinitionNode) {
        String key = classDefinitionNode.className().text().trim();
        this.nodeRefMap.putClassNode(key, classDefinitionNode);
    }

    @Override
    public void visit(ImportDeclarationNode importDeclarationNode) {
        // Key by the imported module identity plus alias: the same module may legally be
        // imported more than once under different prefixes, and identity-only keys would
        // silently overwrite one of them. An alias-only change therefore reads as a
        // deletion+addition pair rather than a modification — an acceptable trade for
        // never dropping an import from the diff.
        String orgName = importDeclarationNode.orgName().map(org -> org.orgName().text() + "/").orElse("");
        String moduleName = importDeclarationNode.moduleName().stream()
                .map(identifier -> identifier.text().trim())
                .collect(Collectors.joining("."));
        // " as <prefix>" keeps the key readable, since it doubles as the diff's display name.
        String prefix = importDeclarationNode.prefix()
                .map(p -> " as " + p.prefix().text().trim())
                .orElse("");
        this.nodeRefMap.putImportNode(orgName + moduleName + prefix, importDeclarationNode);
    }

    private static String getPath(NodeList<Node> paths) {
        return paths.stream().map(Node::toString).map(String::trim).collect(Collectors.joining(""));
    }
}
