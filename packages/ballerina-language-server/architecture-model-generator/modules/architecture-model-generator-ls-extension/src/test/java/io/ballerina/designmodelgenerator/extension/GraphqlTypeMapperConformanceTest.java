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

package io.ballerina.designmodelgenerator.extension;

import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.compiler.syntax.tree.ServiceDeclarationNode;
import io.ballerina.designmodelgenerator.core.DesignModelGenerator;
import io.ballerina.designmodelgenerator.core.model.GraphqlField;
import io.ballerina.designmodelgenerator.core.model.Service;
import io.ballerina.projects.BuildOptions;
import io.ballerina.projects.Document;
import io.ballerina.projects.Module;
import io.ballerina.projects.Project;
import io.ballerina.projects.directory.ProjectLoader;
import io.ballerina.stdlib.graphql.commons.types.Field;
import io.ballerina.stdlib.graphql.commons.types.Schema;
import io.ballerina.stdlib.graphql.commons.types.Type;
import io.ballerina.stdlib.graphql.commons.types.TypeKind;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.stream.Collectors;

import static io.ballerina.stdlib.graphql.compiler.Utils.getSchemaObject;

/**
 * Checks that {@code GraphqlTypeMapper}, which copies the GraphQL compiler plugin's type mapping so the diagrams can
 * show GraphQL types, still agrees with the plugin. The plugin on the test classpath is the
 * {@code stdlibGraphqlVersion} the language server is built against, so bumping the GraphQL module re-runs this check
 * against the new plugin: a failure means the plugin changed a rule and the mapper has to follow.
 *
 * @since 1.7.0
 */
public class GraphqlTypeMapperConformanceTest {

    private static final Path SOURCE_DIR = Path.of("src/test/resources/get_design_model/source");

    // GraphQL services covering the mapper's rules: scalars, @graphql:ID, nullability, lists, tables, aliases,
    // readonly intersections, defaults, injected parameters, deprecation and subscription streams.
    private static final List<String> PROJECTS = List.of("project_19");

    // Fields where the diagram knowingly differs from the plugin, with the reason. A difference that is not listed
    // here fails the test, so a new one cannot slip in unnoticed.
    private static final Map<String, String> KNOWN_DIFFERENCES = Map.of(
            "Query.account", "A hierarchical resource path (`get account/name`) becomes a nested type in the schema; "
                    + "the diagram shows the full path instead of a root field.",
            "Query.profileList", "The plugin leaves an alias of a list (`type Profiles Profile[]`) unnamed; the "
                    + "diagram shows the list it names, `[Profile!]!`.",
            "Query.email", "The plugin leaves an alias of a scalar (`type Email string`) unnamed; the diagram shows "
                    + "the scalar it names, `String!`."
    );

    @Test
    public void mapperMatchesCompilerPlugin() {
        List<String> mismatches = new ArrayList<>();
        for (String projectName : PROJECTS) {
            // Offline: resolve only from the build-owned Ballerina home, never from Ballerina Central.
            Project project = ProjectLoader.load(SOURCE_DIR.resolve(projectName).toAbsolutePath(),
                    BuildOptions.builder().setOffline(true).build()).project();
            Module module = project.currentPackage().getDefaultModule();
            SemanticModel semanticModel = project.currentPackage().getCompilation()
                    .getSemanticModel(module.moduleId());
            List<Service> services = new DesignModelGenerator(project.currentPackage()).generate().services();

            for (var documentId : module.documentIds()) {
                Document document = module.document(documentId);
                ModulePartNode root = document.syntaxTree().rootNode();
                for (var member : root.members()) {
                    if (!(member instanceof ServiceDeclarationNode serviceNode)) {
                        continue;
                    }
                    Schema schema = getSchemaObject(serviceNode, semanticModel, project);
                    Service service = findService(services, document.name(), serviceNode);
                    Map<String, String> mapped = mapperFields(service);
                    if (schema == null) {
                        if (!mapped.isEmpty()) {
                            mismatches.add(projectName + ": a non-GraphQL service has GraphQL fields " + mapped);
                        }
                        continue;
                    }
                    compare(projectName, pluginFields(schema), mapped, mismatches);
                }
            }
        }
        if (!mismatches.isEmpty()) {
            Assert.fail("GraphqlTypeMapper no longer matches the GraphQL compiler plugin (stdlibGraphqlVersion). "
                    + "Update GraphqlTypeMapper to the plugin's rule, or list the field in KNOWN_DIFFERENCES with "
                    + "the reason:\n  " + String.join("\n  ", mismatches));
        }
    }

    private static void compare(String projectName, Map<String, String> plugin, Map<String, String> mapped,
                                List<String> mismatches) {
        for (Map.Entry<String, String> entry : plugin.entrySet()) {
            String field = entry.getKey();
            boolean known = KNOWN_DIFFERENCES.containsKey(field);
            String mapperSignature = mapped.get(field);
            if (!entry.getValue().equals(mapperSignature) && !known) {
                mismatches.add(projectName + " " + field + ": plugin `" + entry.getValue() + "`, mapper `"
                        + mapperSignature + "`");
            } else if (entry.getValue().equals(mapperSignature) && known) {
                mismatches.add(projectName + " " + field + " now matches; remove it from KNOWN_DIFFERENCES");
            }
        }
        mapped.keySet().stream()
                .filter(field -> !plugin.containsKey(field))
                .forEach(field -> mismatches.add(projectName + " " + field + ": not in the plugin's schema"));
    }

    private static Service findService(List<Service> services, String fileName, ServiceDeclarationNode node) {
        int line = node.lineRange().startLine().line();
        return services.stream()
                .filter(service -> service.getLocation().filePath().endsWith(fileName)
                        && service.getLocation().startLine().line() == line)
                .findFirst()
                .orElseThrow(() -> new AssertionError("No design model service at " + fileName + ":" + line));
    }

    // Root operation fields the plugin generates, as `Operation.field` -> `field(args): Type`.
    private static Map<String, String> pluginFields(Schema schema) {
        Map<String, String> fields = new TreeMap<>();
        addPluginFields(fields, schema.getQueryType());
        addPluginFields(fields, schema.getMutationType());
        addPluginFields(fields, schema.getSubscriptionType());
        return fields;
    }

    private static void addPluginFields(Map<String, String> fields, Type operation) {
        if (operation == null) {
            return;
        }
        for (Field field : operation.getFields()) {
            String args = field.getArgs().stream()
                    .map(arg -> argument(arg.getName(), toSdl(arg.getType()), arg.getDefaultValue()))
                    .collect(Collectors.joining(", "));
            fields.put(operation.getName() + "." + field.getName(),
                    signature(field.getName(), args, toSdl(field.getType()), field.isDeprecated()));
        }
    }

    // Root operation fields the design model shows, in the same form.
    private static Map<String, String> mapperFields(Service service) {
        Map<String, String> fields = new TreeMap<>();
        service.getResourceFunctions().forEach(function -> addMapperField(fields,
                "subscribe".equals(function.accessor()) ? "Subscription" : "Query", function.graphqlField()));
        service.getRemoteFunctions().forEach(function -> addMapperField(fields, "Mutation", function.graphqlField()));
        return fields;
    }

    private static void addMapperField(Map<String, String> fields, String operation, GraphqlField field) {
        if (field == null) {
            return;
        }
        String args = field.args().stream()
                .map(arg -> argument(arg.name(), arg.type(), arg.defaultValue()))
                .collect(Collectors.joining(", "));
        fields.put(operation + "." + field.name(), signature(field.name(), args, field.type(), field.deprecated()));
    }

    private static String argument(String name, String type, String defaultValue) {
        return name + ": " + type + (defaultValue == null ? "" : " = " + defaultValue);
    }

    private static String signature(String name, String args, String type, boolean deprecated) {
        return name + "(" + args + "): " + type + (deprecated ? " @deprecated" : "");
    }

    private static String toSdl(Type type) {
        if (type.getOfType() == null) {
            return type.getName();
        }
        if (type.getKind() == TypeKind.NON_NULL) {
            return toSdl(type.getOfType()) + "!";
        }
        if (type.getKind() == TypeKind.LIST) {
            return "[" + toSdl(type.getOfType()) + "]";
        }
        return type.getName();
    }
}
