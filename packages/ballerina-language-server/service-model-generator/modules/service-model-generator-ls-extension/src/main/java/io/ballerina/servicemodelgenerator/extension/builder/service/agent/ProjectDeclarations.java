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

package io.ballerina.servicemodelgenerator.extension.builder.service.agent;

import io.ballerina.compiler.syntax.tree.BasicLiteralNode;
import io.ballerina.compiler.syntax.tree.CaptureBindingPatternNode;
import io.ballerina.compiler.syntax.tree.CheckExpressionNode;
import io.ballerina.compiler.syntax.tree.ClassDefinitionNode;
import io.ballerina.compiler.syntax.tree.ConstantDeclarationNode;
import io.ballerina.compiler.syntax.tree.ExplicitNewExpressionNode;
import io.ballerina.compiler.syntax.tree.ExpressionNode;
import io.ballerina.compiler.syntax.tree.FunctionArgumentNode;
import io.ballerina.compiler.syntax.tree.ImplicitNewExpressionNode;
import io.ballerina.compiler.syntax.tree.ListenerDeclarationNode;
import io.ballerina.compiler.syntax.tree.MappingConstructorExpressionNode;
import io.ballerina.compiler.syntax.tree.ModuleMemberDeclarationNode;
import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.compiler.syntax.tree.ModuleVariableDeclarationNode;
import io.ballerina.compiler.syntax.tree.NamedArgumentNode;
import io.ballerina.compiler.syntax.tree.Node;
import io.ballerina.compiler.syntax.tree.ParenthesizedArgList;
import io.ballerina.compiler.syntax.tree.PositionalArgumentNode;
import io.ballerina.compiler.syntax.tree.ServiceDeclarationNode;
import io.ballerina.compiler.syntax.tree.SimpleNameReferenceNode;
import io.ballerina.compiler.syntax.tree.SpecificFieldNode;
import io.ballerina.compiler.syntax.tree.SyntaxKind;
import io.ballerina.compiler.syntax.tree.SyntaxTree;
import io.ballerina.compiler.syntax.tree.TemplateExpressionNode;
import io.ballerina.compiler.syntax.tree.Token;
import io.ballerina.tools.text.TextDocuments;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * What the project's module-level declarations say, read from the syntax trees rather than from the raw text, so that
 * a declaration in a comment or a string is not mistaken for one.
 *
 * @since 1.9.0
 */
final class ProjectDeclarations {

    private static final String SYSTEM_PROMPT = "systemPrompt";
    private static final String ROLE = "role";

    private final Set<String> classes = new HashSet<>();
    private final Set<String> variables = new HashSet<>();
    private final Set<String> servedListeners = new HashSet<>();
    private final Set<Integer> ports = new LinkedHashSet<>();
    private final Map<String, String> stringConstants = new HashMap<>();
    private final Map<String, Integer> intValues = new HashMap<>();
    private final Map<String, ExpressionNode> initializers = new HashMap<>();

    private ProjectDeclarations() {
    }

    static ProjectDeclarations parse(List<String> sources) {
        List<ModulePartNode> roots = new ArrayList<>();
        for (String source : sources) {
            roots.add(SyntaxTree.from(TextDocuments.from(source)).rootNode());
        }
        ProjectDeclarations declarations = new ProjectDeclarations();
        roots.forEach(declarations::collectDeclarations);
        roots.forEach(declarations::collectUses);
        return declarations;
    }

    boolean hasClass(String name) {
        return classes.contains(name);
    }

    /** Whether a module-level variable, configurable or listener has this name. */
    boolean hasVariable(String name) {
        return variables.contains(name);
    }

    /** Whether some service is attached to the listener with this name. */
    boolean serves(String listenerName) {
        return servedListeners.contains(listenerName);
    }

    /** The ports the project's listeners and int configurables already use. */
    Set<Integer> usedPorts() {
        return ports;
    }

    /** The role the agent is declared with, when it is written as text, a template or a string constant. */
    Optional<String> roleOf(String agentVar) {
        return Optional.ofNullable(initializers.get(agentVar))
                .flatMap(ProjectDeclarations::newArguments)
                .flatMap(ProjectDeclarations::systemPrompt)
                .flatMap(prompt -> field(prompt, ROLE))
                .flatMap(this::textOf)
                .filter(role -> !role.isBlank());
    }

    private void collectDeclarations(ModulePartNode root) {
        for (ModuleMemberDeclarationNode member : root.members()) {
            if (member instanceof ClassDefinitionNode classDefinition) {
                classes.add(classDefinition.className().text());
            } else if (member instanceof ModuleVariableDeclarationNode variable
                    && variable.typedBindingPattern().bindingPattern() instanceof CaptureBindingPatternNode capture) {
                String name = capture.variableName().text();
                variables.add(name);
                variable.initializer().ifPresent(initializer -> {
                    initializers.put(name, initializer);
                    asInt(initializer).ifPresent(value -> intValues.put(name, value));
                });
            } else if (member instanceof ListenerDeclarationNode listener) {
                variables.add(listener.variableName().text());
            } else if (member instanceof ConstantDeclarationNode constant
                    && constant.initializer() instanceof ExpressionNode value) {
                String name = constant.variableName().text();
                asText(value).ifPresent(text -> stringConstants.put(name, text));
                asInt(value).ifPresent(number -> intValues.put(name, number));
            }
        }
    }

    private void collectUses(ModulePartNode root) {
        for (ModuleMemberDeclarationNode member : root.members()) {
            if (member instanceof ListenerDeclarationNode listener
                    && listener.initializer() instanceof ExpressionNode initializer) {
                portsOf(initializer);
            } else if (member instanceof ServiceDeclarationNode service) {
                for (ExpressionNode listener : service.expressions()) {
                    if (listener instanceof SimpleNameReferenceNode name) {
                        servedListeners.add(name.name().text());
                    } else {
                        portsOf(listener);
                    }
                }
            } else if (member instanceof ModuleVariableDeclarationNode variable && isConfigurable(variable)) {
                variable.initializer().flatMap(ProjectDeclarations::asInt).ifPresent(ports::add);
            }
        }
    }

    private static boolean isConfigurable(ModuleVariableDeclarationNode variable) {
        return variable.qualifiers().stream().anyMatch(q -> q.kind() == SyntaxKind.CONFIGURABLE_KEYWORD);
    }

    /** The port a listener is created with: its first positional argument, or the one named port or listenOn. */
    private void portsOf(ExpressionNode listenerInit) {
        Optional<ParenthesizedArgList> args = newArguments(listenerInit);
        if (args.isEmpty()) {
            return;
        }
        boolean first = true;
        for (FunctionArgumentNode argument : args.get().arguments()) {
            ExpressionNode value = null;
            if (argument instanceof PositionalArgumentNode positional && first) {
                value = positional.expression();
            } else if (argument instanceof NamedArgumentNode named && isPortName(named.argumentName().name().text())) {
                value = named.expression();
            }
            first = false;
            if (value != null) {
                resolveInt(value).ifPresent(ports::add);
            }
        }
    }

    private static boolean isPortName(String name) {
        return name.equals("port") || name.equals("listenOn");
    }

    private Optional<Integer> resolveInt(ExpressionNode value) {
        if (value instanceof SimpleNameReferenceNode name) {
            return Optional.ofNullable(intValues.get(name.name().text()));
        }
        return asInt(value);
    }

    private static Optional<ParenthesizedArgList> newArguments(ExpressionNode expression) {
        ExpressionNode expr = expression instanceof CheckExpressionNode check ? check.expression() : expression;
        if (expr instanceof ImplicitNewExpressionNode implicit) {
            return implicit.parenthesizedArgList();
        }
        if (expr instanceof ExplicitNewExpressionNode explicit) {
            return Optional.of(explicit.parenthesizedArgList());
        }
        return Optional.empty();
    }

    private static Optional<MappingConstructorExpressionNode> systemPrompt(ParenthesizedArgList args) {
        for (FunctionArgumentNode argument : args.arguments()) {
            if (argument instanceof NamedArgumentNode named
                    && named.argumentName().name().text().equals(SYSTEM_PROMPT)
                    && named.expression() instanceof MappingConstructorExpressionNode mapping) {
                return Optional.of(mapping);
            }
        }
        return Optional.empty();
    }

    private static Optional<ExpressionNode> field(MappingConstructorExpressionNode mapping, String name) {
        return mapping.fields().stream()
                .filter(SpecificFieldNode.class::isInstance)
                .map(SpecificFieldNode.class::cast)
                .filter(f -> name.equals(f.fieldName().toSourceCode().strip().replace("\"", "")))
                .findFirst()
                .flatMap(SpecificFieldNode::valueExpr);
    }

    private Optional<String> textOf(ExpressionNode value) {
        if (value instanceof SimpleNameReferenceNode name) {
            return Optional.ofNullable(stringConstants.get(name.name().text()));
        }
        return asText(value);
    }

    /** The text of a string literal, or of a string template that has no interpolation. */
    private static Optional<String> asText(ExpressionNode value) {
        if (value instanceof BasicLiteralNode literal && literal.kind() == SyntaxKind.STRING_LITERAL) {
            String text = literal.literalToken().text();
            return Optional.of(text.substring(1, text.length() - 1).replace("\\\"", "\"").replace("\\\\", "\\"));
        }
        if (value instanceof TemplateExpressionNode template
                && template.kind() == SyntaxKind.STRING_TEMPLATE_EXPRESSION) {
            StringBuilder text = new StringBuilder();
            for (Node part : template.content()) {
                if (part.kind() != SyntaxKind.TEMPLATE_STRING || !(part instanceof Token string)) {
                    return Optional.empty();
                }
                text.append(string.text());
            }
            return Optional.of(text.toString());
        }
        return Optional.empty();
    }

    private static Optional<Integer> asInt(Node value) {
        if (value instanceof BasicLiteralNode literal
                && literal.literalToken().kind() == SyntaxKind.DECIMAL_INTEGER_LITERAL_TOKEN) {
            String text = literal.literalToken().text();
            if (text.matches("\\d{2,5}")) {
                return Optional.of(Integer.parseInt(text));
            }
        }
        return Optional.empty();
    }
}
