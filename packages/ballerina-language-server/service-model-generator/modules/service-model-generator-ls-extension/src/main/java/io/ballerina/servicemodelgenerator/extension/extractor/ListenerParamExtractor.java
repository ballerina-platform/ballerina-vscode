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

package io.ballerina.servicemodelgenerator.extension.extractor;

import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.api.symbols.Symbol;
import io.ballerina.compiler.api.symbols.VariableSymbol;
import io.ballerina.compiler.syntax.tree.CheckExpressionNode;
import io.ballerina.compiler.syntax.tree.ExplicitNewExpressionNode;
import io.ballerina.compiler.syntax.tree.ExpressionNode;
import io.ballerina.compiler.syntax.tree.FunctionArgumentNode;
import io.ballerina.compiler.syntax.tree.ImplicitNewExpressionNode;
import io.ballerina.compiler.syntax.tree.ListConstructorExpressionNode;
import io.ballerina.compiler.syntax.tree.ListenerDeclarationNode;
import io.ballerina.compiler.syntax.tree.MappingConstructorExpressionNode;
import io.ballerina.compiler.syntax.tree.MappingFieldNode;
import io.ballerina.compiler.syntax.tree.ModuleMemberDeclarationNode;
import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.compiler.syntax.tree.NameReferenceNode;
import io.ballerina.compiler.syntax.tree.NamedArgumentNode;
import io.ballerina.compiler.syntax.tree.Node;
import io.ballerina.compiler.syntax.tree.ParenthesizedArgList;
import io.ballerina.compiler.syntax.tree.PositionalArgumentNode;
import io.ballerina.compiler.syntax.tree.SeparatedNodeList;
import io.ballerina.compiler.syntax.tree.ServiceDeclarationNode;
import io.ballerina.compiler.syntax.tree.SimpleNameReferenceNode;
import io.ballerina.compiler.syntax.tree.SpecificFieldNode;
import io.ballerina.compiler.syntax.tree.SyntaxKind;
import io.ballerina.compiler.syntax.tree.SyntaxTree;
import io.ballerina.modelgenerator.commons.ReadOnlyMetaData;
import io.ballerina.projects.Document;
import io.ballerina.servicemodelgenerator.extension.model.context.ModelFromSourceContext;
import io.ballerina.tools.diagnostics.Location;
import io.ballerina.tools.text.LineRange;
import io.ballerina.tools.text.TextDocument;
import io.ballerina.tools.text.TextRange;
import org.ballerinalang.langserver.commons.workspace.WorkspaceManager;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Extractor for LISTENER_PARAM kind readOnly metadata.
 * Extracts parameter values from listener declarations in service expressions.
 *
 * @since 1.3.0
 */
public class ListenerParamExtractor implements ReadOnlyMetadataExtractor {

    private static final String LISTENER_PARAM_KIND = "LISTENER_PARAM";

    /**
     * Finds the ListenerDeclarationNode for a given variable symbol.
     * Implements the working approach from the debug implementation.
     *
     * @param variableSymbol The variable symbol representing the listener
     * @param context        The model from source context with access to workspace manager
     * @return The ListenerDeclarationNode if found
     */
    public static Optional<ListenerDeclarationNode> findListenerDeclaration(VariableSymbol variableSymbol,
                                                                            ModelFromSourceContext context) {
        // Get the location of the variable symbol
        Optional<Location> location = variableSymbol.getLocation();
        if (location.isEmpty()) {
            return Optional.empty();
        }

        try {
            // Get document from workspace manager
            WorkspaceManager workspaceManager = context.workspaceManager();
            String filePath = location.get().lineRange().filePath();
            if (filePath == null) {
                return Optional.empty();
            }

            Optional<Document> documentOpt = workspaceManager.document(Path.of(filePath));
            if (documentOpt.isEmpty()) {
                return Optional.empty();
            }

            // Use the working approach from the debug implementation
            SyntaxTree syntaxTree = documentOpt.get().syntaxTree();
            TextDocument textDocument = syntaxTree.textDocument();
            LineRange lineRange = location.get().lineRange();

            int start = textDocument.textPositionFrom(lineRange.startLine());
            int end = textDocument.textPositionFrom(lineRange.endLine());

            ModulePartNode modulePartNode = syntaxTree.rootNode();
            Node foundNode = modulePartNode.findNode(TextRange.from(start, end - start), true);

            // Traverse up to find the ListenerDeclarationNode
            Node current = foundNode;
            while (current != null) {
                if (current instanceof ListenerDeclarationNode listenerDeclarationNode) {
                    return Optional.of(listenerDeclarationNode);
                }
                current = current.parent();
            }
        } catch (RuntimeException e) {
            // Handle any runtime exceptions that may occur during workspace or file operations
            return Optional.empty();
        }

        return Optional.empty();
    }

    @Override
    public Map<String, List<String>> extractValues(ReadOnlyMetaData metadataItem, ServiceDeclarationNode serviceNode,
                                                   ModelFromSourceContext context) {
        Map<String, List<String>> result = new HashMap<>();

        // Extract listener parameter values from all listeners (can be multiple)
        List<String> paramValues = extractAllListenerParameterValues(serviceNode, context.semanticModel(),
                metadataItem.metadataKey(), context);

        if (!paramValues.isEmpty()) {
            String displayName = metadataItem.displayName() != null && !metadataItem.displayName().isEmpty()
                    ? metadataItem.displayName()
                    : metadataItem.metadataKey();

            result.put(displayName, paramValues);
        }

        return result;
    }

    @Override
    public String getSupportedKind() {
        return LISTENER_PARAM_KIND;
    }

    /**
     * Extracts parameter values from ALL listener declarations (handles multiple listeners).
     * Also handles attach-point extraction if requested.
     *
     * @param serviceNode   The service declaration node
     * @param semanticModel The semantic model for symbol resolution
     * @param parameterName The parameter name to extract (e.g., "host", "port", "attach-point")
     * @param context       The model from source context
     * @return List of parameter values from all listeners
     */
    private List<String> extractAllListenerParameterValues(ServiceDeclarationNode serviceNode,
                                                           SemanticModel semanticModel,
                                                           String parameterName, ModelFromSourceContext context) {
        List<String> allValues = new ArrayList<>();

        // Extract from each listener expression
        SeparatedNodeList<ExpressionNode> expressions = serviceNode.expressions();
        for (ExpressionNode expression : expressions) {
            List<String> paramValues = extractValuesFromExpression(expression, semanticModel, parameterName, context);
            allValues.addAll(paramValues);
        }

        return allValues;
    }

    /**
     * Extracts parameter value(s) from an expression node, handling arrays properly.
     *
     * @param expression    The expression to analyze
     * @param semanticModel The semantic model
     * @param parameterName The parameter name to find
     * @param context       The model from source context
     * @return List of parameter values (single value or multiple for arrays)
     */
    private List<String> extractValuesFromExpression(ExpressionNode expression, SemanticModel semanticModel,
                                                     String parameterName, ModelFromSourceContext context) {
        if (expression instanceof ExplicitNewExpressionNode explicitNew) {
            return extractFromListenerConstructor(explicitNew, parameterName, semanticModel, context);
        } else if (expression instanceof NameReferenceNode nameRef) {
            return extractFromVariableReference(nameRef, semanticModel, parameterName, context);
        }
        return new ArrayList<>();
    }

    /**
     * Extracts parameter from listener constructor arguments.
     *
     * @param constructorNode The listener constructor node
     * @param parameterName   The parameter name to find
     * @param semanticModel   The semantic model for resolving configurable variables
     * @param context         The model from source context
     * @return List of parameter values (multiple if array, single if not)
     */
    private List<String> extractFromListenerConstructor(ExplicitNewExpressionNode constructorNode, String parameterName,
                                                        SemanticModel semanticModel, ModelFromSourceContext context) {
        SeparatedNodeList<FunctionArgumentNode> arguments = constructorNode.parenthesizedArgList().arguments();
        if (arguments.isEmpty()) {
            return new ArrayList<>();
        }

        return extractFromArguments(arguments, parameterName, semanticModel, context);
    }

    /**
     * Extracts parameter from a variable reference (listener variable).
     * Resolves the listener variable and extracts parameters from its constructor.
     *
     * @param nameRef       The variable reference node
     * @param semanticModel The semantic model
     * @param parameterName The parameter name to find
     * @param context       The model from source context with access to workspace manager
     * @return List of parameter values
     */
    private List<String> extractFromVariableReference(NameReferenceNode nameRef, SemanticModel semanticModel,
                                                      String parameterName, ModelFromSourceContext context) {
        // The listener variable is declared in the same file as the service, so resolve its
        // declaration directly from the shared syntax tree. The symbol -> workspace-document lookup
        // (findListenerDeclaration) is kept only as a fallback: it resolves a relative file path
        // against the workspace and returns empty for a same-file listener, so on its own the value
        // never resolves.
        Optional<ListenerDeclarationNode> listenerNode = findListenerDeclarationInModule(nameRef);
        if (listenerNode.isEmpty()) {
            Optional<Symbol> symbol = semanticModel.symbol(nameRef);
            if (symbol.isPresent() && symbol.get() instanceof VariableSymbol variableSymbol) {
                listenerNode = findListenerDeclaration(variableSymbol, context);
            }
        }
        if (listenerNode.isPresent()) {
            // Extract from the listener's initializer expression
            Node initializer = listenerNode.get().initializer();

            if (initializer instanceof CheckExpressionNode checkExpr) {
                initializer = checkExpr.expression();
            }

            if (initializer instanceof ExplicitNewExpressionNode explicitNew) {
                return extractFromListenerConstructor(explicitNew, parameterName, semanticModel, context);
            } else if (initializer instanceof ImplicitNewExpressionNode implicitNew) {
                return extractFromImplicitListenerConstructor(implicitNew, parameterName, semanticModel, context);
            }
        }

        return new ArrayList<>();
    }

    /**
     * Finds the module-level {@code listener} declaration bound to a simple name reference by walking
     * up to the enclosing {@link ModulePartNode} and matching the declared variable name — the
     * listener and the service share a syntax tree, so no symbol/workspace resolution is needed.
     */
    private static Optional<ListenerDeclarationNode> findListenerDeclarationInModule(NameReferenceNode nameRef) {
        if (!(nameRef instanceof SimpleNameReferenceNode simpleName)) {
            return Optional.empty();
        }
        String listenerName = simpleName.name().text();
        Node current = nameRef;
        while (current != null && !(current instanceof ModulePartNode)) {
            current = current.parent();
        }
        // The loop above only exits when `current` is null or already a ModulePartNode.
        if (current == null) {
            return Optional.empty();
        }
        ModulePartNode modulePart = (ModulePartNode) current;
        for (ModuleMemberDeclarationNode member : modulePart.members()) {
            if (member instanceof ListenerDeclarationNode listener
                    && listener.variableName().text().equals(listenerName)) {
                return Optional.of(listener);
            }
        }
        return Optional.empty();
    }

    /**
     * Extracts parameter from implicit listener constructor arguments.
     *
     * @param constructorNode The implicit listener constructor node
     * @param parameterName   The parameter name to find
     * @param semanticModel   The semantic model for resolving configurable variables
     * @param context         The model from source context
     * @return List of parameter values
     */
    private List<String> extractFromImplicitListenerConstructor(ImplicitNewExpressionNode constructorNode,
                                                                String parameterName,
                                                                SemanticModel semanticModel,
                                                                ModelFromSourceContext context) {
        Optional<ParenthesizedArgList> parenthesizedArgList = constructorNode.parenthesizedArgList();
        if (parenthesizedArgList.isEmpty()) {
            return new ArrayList<>();
        }

        SeparatedNodeList<FunctionArgumentNode> arguments = parenthesizedArgList.get().arguments();
        if (arguments.isEmpty()) {
            return new ArrayList<>();
        }

        return extractFromArguments(arguments, parameterName, semanticModel, context);
    }

    /**
     * Utility method to extract parameter values from function arguments.
     * Handles both named arguments and positional arguments (including "argN" pattern).
     *
     * @param arguments     The function arguments to search through
     * @param parameterName The parameter name to find
     * @param semanticModel The semantic model for resolving configurable variables
     * @param context       The model from source context
     * @return List of parameter values found
     */
    private List<String> extractFromArguments(SeparatedNodeList<FunctionArgumentNode> arguments,
                                              String parameterName,
                                              SemanticModel semanticModel,
                                              ModelFromSourceContext context) {
        int positionalIndex = 0;
        int targetArgIndex = -1;

        // Check if parameter name follows "argN" pattern (e.g., "arg1", "arg2", "arg3")
        if (parameterName.matches("arg\\d+")) {
            try {
                targetArgIndex = Integer.parseInt(parameterName.substring(3)) - 1; // arg1 -> index 0, arg2 -> index 1
            } catch (NumberFormatException e) {
                // Invalid parameter name format, ignore
            }
        }

        for (FunctionArgumentNode argument : arguments) {
            if (argument instanceof NamedArgumentNode namedArg) {
                String argName = namedArg.argumentName().name().text();
                if (argName.equals(parameterName)) {
                    return extractValuesFromSingleExpression(namedArg.expression(), semanticModel, context);
                }
            } else if (argument instanceof PositionalArgumentNode positionalArg) {
                // An included-field config record passed as a mapping constructor
                // (e.g. `new file:Listener({path: "/tmp", ...})`): the field lives inside the
                // mapping, not as a named/positional listener argument, so descend by field name.
                if (positionalArg.expression() instanceof MappingConstructorExpressionNode mapping) {
                    List<String> fieldValues = extractFromMappingField(mapping, parameterName,
                            semanticModel, context);
                    if (!fieldValues.isEmpty()) {
                        return fieldValues;
                    }
                }
                if (targetArgIndex == positionalIndex) {
                    return extractValuesFromSingleExpression(positionalArg.expression(), semanticModel, context);
                }
                positionalIndex++;
            }
        }

        return new ArrayList<>();
    }

    /**
     * Extracts a field's value from a mapping constructor used as an included-field config record —
     * e.g. {@code path} from {@code {path: "/tmp", recursive: false}}. Matches both a plain
     * identifier key ({@code path:}) and a quoted-string key ({@code "path":}).
     */
    private List<String> extractFromMappingField(MappingConstructorExpressionNode mapping, String fieldName,
                                                 SemanticModel semanticModel, ModelFromSourceContext context) {
        for (MappingFieldNode field : mapping.fields()) {
            if (field instanceof SpecificFieldNode specificField && specificField.valueExpr().isPresent()) {
                String key = specificField.fieldName().toString().trim();
                if (key.length() >= 2 && key.startsWith("\"") && key.endsWith("\"")) {
                    key = key.substring(1, key.length() - 1);
                }
                if (key.equals(fieldName)) {
                    return extractValuesFromSingleExpression(specificField.valueExpr().get(),
                            semanticModel, context);
                }
            }
        }
        return new ArrayList<>();
    }


    /**
     * Extracts value from an expression node with support for configurable variables.
     *
     * @param expression The expression to extract value from
     * @return The extracted value as string
     */
    private String extractValueFromExpression(ExpressionNode expression) {
        if (expression.kind().equals(SyntaxKind.NUMERIC_LITERAL) ||
                expression.kind().equals(SyntaxKind.STRING_LITERAL) ||
                expression.kind().equals(SyntaxKind.BOOLEAN_LITERAL)) {
            String value = expression.toString().trim();
            // Remove quotes from string literals
            if (value.startsWith("\"") && value.endsWith("\"")) {
                return value.substring(1, value.length() - 1);
            }
            return value;
        }
        return expression.toString().trim();
    }

    /**
     * Extracts values from a single expression, handling arrays properly.
     *
     * @param expression    The expression to extract values from
     * @param semanticModel The semantic model
     * @param context       The model from source context
     * @return List of values (multiple if array, single if not)
     */
    private List<String> extractValuesFromSingleExpression(ExpressionNode expression, SemanticModel semanticModel,
                                                           ModelFromSourceContext context) {
        List<String> values = new ArrayList<>();

        if (expression instanceof ListConstructorExpressionNode listConstructor) {
            SeparatedNodeList<Node> expressions = listConstructor.expressions();
            for (Node expr : expressions) {
                if (expr instanceof ExpressionNode expressionNode) {
                    String value = extractValueFromExpression(expressionNode);
                    if (!value.isEmpty()) {
                        values.add(value);
                    }
                }
            }
        } else {
            // Handle single values
            String value = extractValueFromExpression(expression);
            if (!value.isEmpty()) {
                values.add(value);
            }
        }

        return values;
    }
}
