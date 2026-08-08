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

package io.ballerina.servicemodelgenerator.extension.connector;

import io.ballerina.compiler.syntax.tree.CaptureBindingPatternNode;
import io.ballerina.compiler.syntax.tree.ClassDefinitionNode;
import io.ballerina.compiler.syntax.tree.FunctionDefinitionNode;
import io.ballerina.compiler.syntax.tree.ListenerDeclarationNode;
import io.ballerina.compiler.syntax.tree.ModuleMemberDeclarationNode;
import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.compiler.syntax.tree.ModuleVariableDeclarationNode;
import io.ballerina.compiler.syntax.tree.TypeDefinitionNode;
import io.ballerina.compiler.syntax.tree.TypedBindingPatternNode;
import io.ballerina.modelgenerator.commons.trigger.models.TriggerUISchemaModel.AgentBinding;
import io.ballerina.modelgenerator.commons.trigger.models.TriggerUISchemaModel.SessionScope;
import io.ballerina.servicemodelgenerator.extension.model.Value;
import org.ballerinalang.langserver.common.utils.NameUtil;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * Renders an {@link AgentBinding}'s Ballerina templates against a filled trigger form.
 *
 * @since 1.9.0
 */
public final class AgentBindingRenderer {

    private static final String TEMPLATE_ROOT = "trigger-bindings/";
    private static final String PROP_PREFIX = "prop.";
    private static final String BALLERINA_ORG = "ballerina";
    private static final String DEFAULT_REPLY_FN_NAME = "replyToMessage";

    private AgentBindingRenderer() {
    }

    /**
     * Resolves every placeholder for one generation.
     *
     * @param binding      the channel recipe being rendered
     * @param emitAlias    the prefix the connector's own module is imported under, so a dotted module
     *                     name (e.g. {@code whatsapp.business}) is referenced the same way the rest of
     *                     the generated block references it
     * @param agentVarName the agent variable the trigger is being wired to
     * @param agentOrgName the agent's publishing org, which decides {@code .run} vs {@code ->run}
     * @param sessionScope the selected conversation-key scope; {@code null} falls back to the default
     * @param replyFnName  the uniqued reply function name
     * @param formValues   the filled form, flattened by leaf key
     */
    public record Bindings(AgentBinding binding, String emitAlias, String agentVarName, String agentOrgName,
                           SessionScope sessionScope, String replyFnName, Map<String, String> formValues) {

        private String substitute(String template) {
            if (template == null) {
                return "";
            }
            StringBuilder out = new StringBuilder();
            int cursor = 0;
            while (true) {
                int open = template.indexOf("${", cursor);
                if (open < 0) {
                    out.append(template, cursor, template.length());
                    return out.toString();
                }
                int close = template.indexOf('}', open);
                if (close < 0) {
                    out.append(template, cursor, template.length());
                    return out.toString();
                }
                out.append(template, cursor, open);
                out.append(resolve(template.substring(open + 2, close).trim()));
                cursor = close + 1;
            }
        }

        private String resolve(String key) {
            if (key.startsWith(PROP_PREFIX)) {
                return formValues.getOrDefault(key.substring(PROP_PREFIX.length()), "");
            }
            return switch (key) {
                case "alias" -> nullToEmpty(emitAlias);
                case "agent" -> agentVarName == null ? "" : agentVarName;
                case "run" -> BALLERINA_ORG.equals(agentOrgName) ? ".run" : "->run";
                case "replyFn" -> replyFnName == null ? "" : replyFnName;
                case "clientVar" -> binding.client() == null ? "" : nullToEmpty(binding.client().varName());
                case "listenerVar" -> formValues.getOrDefault("listenerVarName", "");
                case "sessionExpr" -> sessionScope == null ? "" : nullToEmpty(sessionScope.expr());
                case "sessionPrefix" -> nullToEmpty(binding.sessionPrefix());
                default -> "";
            };
        }
    }

    public static String renderHandlerBody(Bindings bindings) {
        return render(bindings, bindings.binding().handlerTemplate());
    }

    public static String renderReplyFunction(Bindings bindings) {
        return render(bindings, bindings.binding().replyFnTemplate());
    }

    public static String renderClientDeclaration(Bindings bindings) {
        AgentBinding binding = bindings.binding();
        return binding.client() == null ? "" : render(bindings, binding.client().template());
    }

    private static String render(Bindings bindings, String templateResource) {
        return loadTemplate(templateResource)
                .map(bindings::substitute)
                .orElse("");
    }

    private static Optional<String> loadTemplate(String templateResource) {
        if (templateResource == null || templateResource.isBlank()) {
            return Optional.empty();
        }
        String path = TEMPLATE_ROOT + templateResource;
        try (InputStream is = AgentBindingRenderer.class.getClassLoader().getResourceAsStream(path)) {
            if (is == null) {
                return Optional.empty();
            }
            return Optional.of(new String(is.readAllBytes(), StandardCharsets.UTF_8).strip());
        } catch (IOException e) {
            return Optional.empty();
        }
    }

    public static SessionScope selectSessionScope(AgentBinding binding, String selectedId) {
        List<SessionScope> scopes = binding.sessionScopes();
        if (scopes == null || scopes.isEmpty()) {
            return null;
        }
        if (selectedId != null && !selectedId.isBlank()) {
            for (SessionScope scope : scopes) {
                if (selectedId.equals(scope.id())) {
                    return scope;
                }
            }
        }
        return scopes.stream()
                .filter(scope -> Boolean.TRUE.equals(scope.isDefault()))
                .findFirst()
                .orElse(scopes.getFirst());
    }

    public static Map<String, String> flattenFormValues(Map<String, Value> properties) {
        Map<String, String> flat = new LinkedHashMap<>();
        collect(properties, flat);
        return flat;
    }

    private static void collect(Map<String, Value> properties, Map<String, String> flat) {
        if (properties == null) {
            return;
        }
        for (Map.Entry<String, Value> entry : properties.entrySet()) {
            Value field = entry.getValue();
            if (field == null) {
                continue;
            }
            String value = field.getValue();
            if (value != null && !value.isBlank()) {
                flat.putIfAbsent(entry.getKey(), value);
            }
            collect(field.getProperties(), flat);
            List<Value> choices = field.getChoices();
            if (choices == null) {
                continue;
            }
            for (Value choice : choices) {
                if (choice != null && choice.isEnabled()) {
                    collect(choice.getProperties(), flat);
                }
            }
        }
    }

    public static String uniqueReplyFunctionName(String preferred, ModulePartNode rootNode) {
        String base = preferred == null || preferred.isBlank() ? DEFAULT_REPLY_FN_NAME : preferred;
        return NameUtil.getValidatedSymbolName(moduleLevelNames(rootNode), base);
    }

    private static Set<String> moduleLevelNames(ModulePartNode rootNode) {
        Set<String> names = new HashSet<>();
        for (ModuleMemberDeclarationNode member : rootNode.members()) {
            switch (member) {
                case FunctionDefinitionNode fn -> names.add(fn.functionName().text().trim());
                case ModuleVariableDeclarationNode var ->
                        bindingPatternName(var.typedBindingPattern()).ifPresent(names::add);
                case ListenerDeclarationNode listener -> names.add(listener.variableName().text().trim());
                case TypeDefinitionNode type -> names.add(type.typeName().text().trim());
                case ClassDefinitionNode cls -> names.add(cls.className().text().trim());
                default -> { }
            }
        }
        return names;
    }

    private static Optional<String> bindingPatternName(TypedBindingPatternNode typedBindingPattern) {
        if (typedBindingPattern.bindingPattern() instanceof CaptureBindingPatternNode capture) {
            return Optional.of(capture.variableName().text().trim());
        }
        return Optional.empty();
    }

    private static String nullToEmpty(String value) {
        return value == null ? "" : value;
    }
}
