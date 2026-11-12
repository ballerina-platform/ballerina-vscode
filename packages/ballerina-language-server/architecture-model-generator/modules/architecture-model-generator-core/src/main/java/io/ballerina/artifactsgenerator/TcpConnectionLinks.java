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

package io.ballerina.artifactsgenerator;

import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.api.symbols.ClassSymbol;
import io.ballerina.compiler.syntax.tree.ClassDefinitionNode;
import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.compiler.syntax.tree.ServiceDeclarationNode;
import io.ballerina.compiler.syntax.tree.SyntaxTree;
import io.ballerina.modelgenerator.commons.service.TcpConnectionServiceResolver;
import io.ballerina.projects.Module;

import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * The TCP services of a module paired with the connection service classes their {@code onConnect} creates.
 * <p>
 * The artifact tree lists such a class's handlers under its service and leaves the class out of Types. The service
 * and the class may sit in different documents, so the artifacts of each depend on the other: {@link #documents()}
 * names every document on either side of a pair, which is what has to be regenerated together.
 *
 * @since 6.0.1
 */
final class TcpConnectionLinks {

    static final TcpConnectionLinks NONE = new TcpConnectionLinks(Map.of(), Set.of(), Set.of());

    private final Map<String, SyntaxTree> syntaxTrees;
    private final Set<String> classNames;
    private final Set<String> documents;

    private TcpConnectionLinks(Map<String, SyntaxTree> syntaxTrees, Set<String> classNames, Set<String> documents) {
        this.syntaxTrees = syntaxTrees;
        this.classNames = classNames;
        this.documents = documents;
    }

    /**
     * Pairs the TCP services of a module with their connection service classes.
     *
     * @param module        the module, or null to pair only within the given syntax tree
     * @param syntaxTree    the syntax tree being processed, used in place of its document's in the module
     * @param semanticModel the semantic model of the module
     * @return the pairs found
     */
    static TcpConnectionLinks of(Module module, SyntaxTree syntaxTree, SemanticModel semanticModel) {
        Map<String, SyntaxTree> syntaxTrees = new HashMap<>();
        if (module != null) {
            module.documentIds().forEach(documentId -> {
                SyntaxTree documentTree = module.document(documentId).syntaxTree();
                syntaxTrees.put(documentTree.filePath(), documentTree);
            });
        }
        if (syntaxTree != null) {
            syntaxTrees.put(syntaxTree.filePath(), syntaxTree);
        }
        return of(syntaxTrees, semanticModel);
    }

    private static TcpConnectionLinks of(Map<String, SyntaxTree> syntaxTrees, SemanticModel semanticModel) {
        Set<String> classNames = new HashSet<>();
        Set<String> documents = new HashSet<>();
        syntaxTrees.values().forEach(syntaxTree -> serviceDeclarations(syntaxTree).forEach(serviceNode ->
                TcpConnectionServiceResolver.findConnectionServiceClass(serviceNode, semanticModel)
                        .ifPresent(classSymbol -> {
                            classSymbol.getName().ifPresent(classNames::add);
                            documents.add(syntaxTree.filePath());
                            classSymbol.getLocation().ifPresent(location ->
                                    documents.add(location.lineRange().fileName()));
                        })));
        return new TcpConnectionLinks(syntaxTrees, Set.copyOf(classNames), Set.copyOf(documents));
    }

    private static List<ServiceDeclarationNode> serviceDeclarations(SyntaxTree syntaxTree) {
        if (!syntaxTree.containsModulePart()) {
            return List.of();
        }
        ModulePartNode rootNode = syntaxTree.rootNode();
        return rootNode.members().stream()
                .filter(ServiceDeclarationNode.class::isInstance)
                .map(ServiceDeclarationNode.class::cast)
                .toList();
    }

    /**
     * Whether a class is the connection service class of a TCP service of the module.
     */
    boolean isConnectionServiceClass(String className) {
        return classNames.contains(className);
    }

    /**
     * The documents holding either side of a pair.
     */
    Set<String> documents() {
        return documents;
    }

    /**
     * The syntax tree of a document of the module, by its file name.
     */
    Optional<SyntaxTree> syntaxTree(String fileName) {
        return Optional.ofNullable(syntaxTrees.get(fileName));
    }

    /**
     * Finds the definition of a connection service class, in whichever document of the module declares it.
     */
    Optional<ClassDefinitionNode> classDefinition(ClassSymbol classSymbol) {
        return classSymbol.getLocation()
                .flatMap(location -> syntaxTree(location.lineRange().fileName()))
                .flatMap(syntaxTree -> TcpConnectionServiceResolver.findClassDefinition(classSymbol, syntaxTree));
    }

    /**
     * The documents to regenerate when one changes: the document itself and, when it was or now is on either side of
     * a pair, every document that was or now is linked.
     *
     * @param document the changed document
     * @param previous the linked documents as of the last generation
     * @param current  the linked documents now
     * @return the documents to regenerate
     */
    static Set<String> withLinkedDocuments(String document, Collection<String> previous, Collection<String> current) {
        Set<String> result = new HashSet<>();
        result.add(document);
        if (previous.contains(document) || current.contains(document)) {
            result.addAll(previous);
            result.addAll(current);
        }
        return result;
    }
}
