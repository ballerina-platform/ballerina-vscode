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

package io.ballerina.copilotagent.core.models;

import io.ballerina.compiler.syntax.tree.ClassDefinitionNode;
import io.ballerina.compiler.syntax.tree.ConstantDeclarationNode;
import io.ballerina.compiler.syntax.tree.EnumDeclarationNode;
import io.ballerina.compiler.syntax.tree.FunctionDefinitionNode;
import io.ballerina.compiler.syntax.tree.ImportDeclarationNode;
import io.ballerina.compiler.syntax.tree.ListenerDeclarationNode;
import io.ballerina.compiler.syntax.tree.ModuleVariableDeclarationNode;
import io.ballerina.compiler.syntax.tree.ServiceDeclarationNode;
import io.ballerina.compiler.syntax.tree.TypeDefinitionNode;

import java.util.HashMap;
import java.util.Map;

/**
 * Model to hold references to various syntax tree nodes.
 *
 * @since 1.5.0
 */
public class STNodeRefMap {
    private final Map<String, ListenerDeclarationNode> listenerNodeMap = new HashMap<>();
    private final Map<String, FunctionDefinitionNode> functionNodeMap = new HashMap<>();
    private final Map<String, ServiceDeclarationNode> serviceNodeMap = new HashMap<>();
    private final Map<String, TypeDefinitionNode> typeDefNodeMap = new HashMap<>();
    private final Map<String, ModuleVariableDeclarationNode> moduleVarNodeMap = new HashMap<>();
    private final Map<String, ConstantDeclarationNode> constantNodeMap = new HashMap<>();
    private final Map<String, EnumDeclarationNode> enumNodeMap = new HashMap<>();
    private final Map<String, ClassDefinitionNode> classNodeMap = new HashMap<>();
    private final Map<String, ImportDeclarationNode> importNodeMap = new HashMap<>();

    public Map<String, ListenerDeclarationNode> getListenerNodeMap() {
        return this.listenerNodeMap;
    }

    public Map<String, FunctionDefinitionNode> getFunctionNodeMap() {
        return this.functionNodeMap;
    }

    public Map<String, ServiceDeclarationNode> getServiceNodeMap() {
        return this.serviceNodeMap;
    }

    public Map<String, TypeDefinitionNode> getTypeDefNodeMap() {
        return this.typeDefNodeMap;
    }

    public Map<String, ModuleVariableDeclarationNode> getModuleVarNodeMap() {
        return this.moduleVarNodeMap;
    }

    public Map<String, ConstantDeclarationNode> getConstantNodeMap() {
        return this.constantNodeMap;
    }

    public Map<String, EnumDeclarationNode> getEnumNodeMap() {
        return this.enumNodeMap;
    }

    public Map<String, ClassDefinitionNode> getClassNodeMap() {
        return this.classNodeMap;
    }

    public Map<String, ImportDeclarationNode> getImportNodeMap() {
        return this.importNodeMap;
    }

    public void putListenerNode(String key, ListenerDeclarationNode node) {
        this.listenerNodeMap.put(key, node);
    }

    public void putFunctionNode(String key, FunctionDefinitionNode node) {
        this.functionNodeMap.put(key, node);
    }

    public void putServiceNode(String key, ServiceDeclarationNode node) {
        this.serviceNodeMap.put(key, node);
    }

    public void putTypeDefNode(String key, TypeDefinitionNode node) {
        this.typeDefNodeMap.put(key, node);
    }

    public void putModuleVarNode(String key, ModuleVariableDeclarationNode node) {
        this.moduleVarNodeMap.put(key, node);
    }

    public void putConstantNode(String key, ConstantDeclarationNode node) {
        this.constantNodeMap.put(key, node);
    }

    public void putEnumNode(String key, EnumDeclarationNode node) {
        this.enumNodeMap.put(key, node);
    }

    public void putClassNode(String key, ClassDefinitionNode node) {
        this.classNodeMap.put(key, node);
    }

    public void putImportNode(String key, ImportDeclarationNode node) {
        this.importNodeMap.put(key, node);
    }
}
