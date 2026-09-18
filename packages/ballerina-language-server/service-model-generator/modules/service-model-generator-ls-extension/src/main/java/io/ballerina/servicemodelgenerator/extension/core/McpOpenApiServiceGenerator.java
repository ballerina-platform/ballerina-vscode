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
 *  KIND, either express or implied. See the License for the
 *  specific language governing permissions and limitations
 *  under the License.
 */

package io.ballerina.servicemodelgenerator.extension.core;

import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.mcp.core.generator.GeneratorOptions;
import io.ballerina.mcp.core.generator.MainBalGenerator;
import io.ballerina.mcp.core.generator.McpGenerationException;
import io.ballerina.mcp.core.generator.McpProjectGenerator;
import io.ballerina.mcp.core.generator.OpenApiSpecParser;
import io.ballerina.mcp.core.model.EndpointInfo;
import io.ballerina.mcp.core.model.SpecInfo;
import io.ballerina.modelgenerator.commons.FileSystemUtils;
import io.ballerina.projects.Document;
import io.ballerina.servicemodelgenerator.extension.model.Codedata;
import io.ballerina.servicemodelgenerator.extension.model.McpServiceDefaults;
import io.ballerina.servicemodelgenerator.extension.model.ServiceInitModel;
import io.ballerina.servicemodelgenerator.extension.model.Value;
import io.ballerina.servicemodelgenerator.extension.util.Utils;
import org.ballerinalang.langserver.commons.workspace.WorkspaceManager;
import org.eclipse.lsp4j.TextEdit;

import java.io.IOException;
import java.io.OutputStream;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import static io.ballerina.servicemodelgenerator.extension.util.Constants.ARG_TYPE_LISTENER_VAR_NAME;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.ARG_TYPE_SERVICE_BASE_PATH;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.PROPERTY_BASE_PATH;

/** Generates a proxy MCP service from a selected subset of an OpenAPI contract. */
public class McpOpenApiServiceGenerator {

    private static final String OPENAPI = "openapi";
    private static final String MAIN_BAL = "main.bal";
    private static final String TYPES_BAL = "types.bal";
    private static final int DEFAULT_PORT = 9090;
    private static final String DEFAULT_LISTENER_NAME = "mcpListener";
    private static final String DEFAULT_CLIENT_NAME = "apiClient";
    private static final String DEFAULT_SERVICE_NAME = "Proxy Service";
    private static final String DEFAULT_VERSION = "1.0.0";
    private static final Pattern SERVICE_PATH_PATTERN =
            Pattern.compile("(service\\s+mcp:StreamableHttpService\\s+)\\S+(\\s+on\\s+mcpListener)");
    private static final Pattern LEADING_IMPORT_PATTERN =
            Pattern.compile("\\Aimport\\s+([\\w.]+)/([\\w.]+);[ \\t]*\\r?\\n");
    private static final Pattern TYPE_DECL_PATTERN =
            Pattern.compile("(?m)^(?:public\\s+)?type\\s+(\\w+)\\s");

    // Only basePath/listenerVarName carry a codedata type in mcp.json, so only those resolve via resolveValue().
    private static final String KEY_SERVICE_NAME = "serviceName";
    private static final String KEY_VERSION = "version";
    private static final String KEY_LISTEN_TO = "listenTo";
    private static final String KEY_LISTENER_VAR_NAME = ServiceInitModel.KEY_LISTENER_VAR_NAME;

    private final Path specPath;
    private final Path projectPath;

    public McpOpenApiServiceGenerator(Path specPath, Path projectPath) {
        this.specPath = specPath;
        this.projectPath = projectPath;
    }

    public Map<String, List<TextEdit>> generateService(ServiceInitModel model, Document mainDocument,
                                                         WorkspaceManager workspaceManager, SemanticModel semanticModel)
            throws McpGenerationException, IOException {
        SpecInfo fullSpec = runSilently(() -> new OpenApiSpecParser().parse(specPath));
        List<EndpointInfo> endpoints = selectedEndpoints(fullSpec.getEndpoints(), model.getSelectedTools());
        McpServiceDefaults defaults = defaultsFor(fullSpec);
        String serviceName = propValue(model, KEY_SERVICE_NAME, defaults.serviceName());
        String version = propValue(model, KEY_VERSION, defaults.version());
        int port = parsePort(propValue(model, KEY_LISTEN_TO, String.valueOf(defaults.port())), defaults.port());
        String requestedListenerName = resolveValue(model, KEY_LISTENER_VAR_NAME, ARG_TYPE_LISTENER_VAR_NAME,
                defaults.listenerName());

        SpecInfo filteredSpec = new SpecInfo(fullSpec.getBaseUrl(), port, serviceName, version, endpoints);
        String serviceSource = runSilently(() -> new MainBalGenerator().generate(filteredSpec));
        String basePath = resolveValue(model, PROPERTY_BASE_PATH, ARG_TYPE_SERVICE_BASE_PATH, null);
        serviceSource = applyBasePath(serviceSource, basePath);
        ModulePartNode mainModulePart = mainDocument.syntaxTree().rootNode();
        // Uniquified against the target file so a second import can't redeclare apiClient/mcpListener,
        // even if the form's own validation missed a collision (e.g. a collapsed advanced-options field).
        String clientName = Utils.generateVariableIdentifier(semanticModel, mainDocument,
                mainModulePart.lineRange().endLine(), DEFAULT_CLIENT_NAME);
        String listenerName = Utils.generateVariableIdentifier(semanticModel, mainDocument,
                mainModulePart.lineRange().endLine(), requestedListenerName);
        // Word-boundary match: a plain replace would also corrupt a tool name like "apiClientStatus".
        serviceSource = serviceSource.replaceAll("\\b" + DEFAULT_CLIENT_NAME + "\\b",
                        Matcher.quoteReplacement(clientName))
                .replaceAll("\\b" + DEFAULT_LISTENER_NAME + "\\b", Matcher.quoteReplacement(listenerName))
                // mcp-core ignores SpecInfo's port and always emits DEFAULT_PORT; this replace is what applies it.
                .replace("new (" + DEFAULT_PORT + ")", "new (" + port + ")");

        String typesSource = generateTypes();
        if (!typesSource.isBlank()) {
            // Unlike apiClient/mcpListener, a type name also appears as ordinary prose in the generated
            // @mcp:Tool description (schema names are typically mentioned in the OpenAPI summary/description
            // text) — a text-level rename would risk corrupting that prose, so a collision fails clearly
            // instead of silently renaming.
            //
            // Checked against every schema in the spec, not just the selected endpoints': mcp-core has no
            // API to generate types.bal from a subset of components.schemas, so every schema is always
            // written regardless of which tools were picked (a pre-existing, independent limitation) —
            // narrowing this check to the selection would let an unselected collision through unreported.
            Set<String> usedNames = Utils.getVisibleSymbols(semanticModel, mainDocument);
            for (String typeName : declaredTypeNames(typesSource)) {
                if (usedNames.contains(typeName)) {
                    throw new McpGenerationException("Generated type '" + typeName
                            + "' already exists in the project. Every schema in the OpenAPI specification is "
                            + "generated into types.bal, including ones not used by the tools you selected. "
                            + "Rename or remove the existing '" + typeName + "', or rename it in the "
                            + "specification, before importing.");
                }
            }
        }

        Map<String, List<TextEdit>> edits = new LinkedHashMap<>();
        edits.put(projectPath.resolve(MAIN_BAL).toAbsolutePath().toString(),
                appendGeneratedSource(mainModulePart, serviceSource));

        if (!typesSource.isBlank()) {
            Path typesPath = projectPath.resolve(TYPES_BAL).toAbsolutePath();
            Document typesDocument = FileSystemUtils.getDocument(workspaceManager, typesPath);
            edits.put(typesPath.toString(),
                    appendGeneratedSource(typesDocument.syntaxTree().rootNode(), typesSource));
        }
        return edits;
    }

    private static List<String> declaredTypeNames(String typesSource) {
        List<String> names = new ArrayList<>();
        Matcher matcher = TYPE_DECL_PATTERN.matcher(typesSource);
        while (matcher.find()) {
            names.add(matcher.group(1));
        }
        return names;
    }

    /** Appends {@code generatedSource}, deduping its leading imports against ones already in {@code modulePart}. */
    private static List<TextEdit> appendGeneratedSource(ModulePartNode modulePart, String generatedSource) {
        StringBuilder missingImports = new StringBuilder();
        String body = generatedSource;
        Matcher importMatcher = LEADING_IMPORT_PATTERN.matcher(body);
        while (importMatcher.find()) {
            String org = importMatcher.group(1);
            String module = importMatcher.group(2);
            if (!Utils.importExists(modulePart, org, module)) {
                missingImports.append(Utils.getImportStmt(org, module));
            }
            body = body.substring(importMatcher.end());
            importMatcher = LEADING_IMPORT_PATTERN.matcher(body);
        }
        body = body.replaceFirst("\\A\\r?\\n", "");

        List<TextEdit> edits = new ArrayList<>();
        if (!missingImports.isEmpty()) {
            edits.add(new TextEdit(Utils.toRange(modulePart.lineRange().startLine()), missingImports.toString()));
        }
        edits.add(Utils.appendAtEndOfModule(modulePart, body));
        return edits;
    }

    /** Rewrites the generated service's path to {@code basePath}; a no-op if {@code basePath} is blank. */
    static String applyBasePath(String serviceSource, String basePath) throws McpGenerationException {
        if (basePath == null || basePath.isBlank()) {
            return serviceSource;
        }
        basePath = basePath.trim();
        String normalized = basePath.startsWith("/") ? basePath : "/" + basePath;
        Matcher basePathMatcher = SERVICE_PATH_PATTERN.matcher(serviceSource);
        if (!basePathMatcher.find()) {
            throw new McpGenerationException(
                    "Could not locate the generated service declaration to apply the base path");
        }
        return basePathMatcher.replaceFirst("$1" + Matcher.quoteReplacement(normalized) + "$2");
    }

    public static McpServiceDefaults defaultsFor(SpecInfo specInfo) {
        String serviceName = Objects.requireNonNullElse(specInfo.getTitle(), DEFAULT_SERVICE_NAME);
        String version = Objects.requireNonNullElse(specInfo.getVersion(), DEFAULT_VERSION);
        return new McpServiceDefaults(serviceName.isBlank() ? DEFAULT_SERVICE_NAME : serviceName,
                version.isBlank() ? DEFAULT_VERSION : version,
                "/" + deriveServicePath(serviceName), DEFAULT_PORT, DEFAULT_LISTENER_NAME);
    }

    // mcp-core has no API to return just the types source, so this scaffolds a full temp project for it.
    private String generateTypes() throws McpGenerationException, IOException {
        Path tempDir = Files.createTempDirectory("mcp-openapi-gen");
        try {
            runSilently(() -> {
                new McpProjectGenerator(new GeneratorOptions(specPath, tempDir, OPENAPI)).generate();
                return null;
            });
            try (Stream<Path> paths = Files.walk(tempDir)) {
                Optional<Path> typesFile = paths.filter(path -> {
                    Path fileName = path.getFileName();
                    return fileName != null && TYPES_BAL.equals(fileName.toString());
                })
                        .findFirst();
                return typesFile.isPresent() ? Files.readString(typesFile.get()) : "";
            }
        } finally {
            try (Stream<Path> paths = Files.walk(tempDir)) {
                paths.sorted(Comparator.reverseOrder()).forEach(path -> {
                    try {
                        Files.deleteIfExists(path);
                    } catch (IOException ignored) {
                        // Best-effort cleanup of generated temporary files.
                    }
                });
            } catch (IOException ignored) {
                // Must not mask the try block's result/exception.
            }
        }
    }

    static List<EndpointInfo> selectedEndpoints(List<EndpointInfo> endpoints, List<String> selectedTools)
            throws McpGenerationException {
        if (selectedTools == null || selectedTools.isEmpty()) {
            return endpoints;
        }
        Set<String> requestedTools = new LinkedHashSet<>(selectedTools);
        List<EndpointInfo> selected = new ArrayList<>();
        Set<String> matchedTools = new HashSet<>();
        for (EndpointInfo endpoint : endpoints) {
            if (!requestedTools.contains(endpoint.getToolName())) {
                continue;
            }
            // Two operations sanitized/collided to the same tool name would otherwise generate two
            // same-named functions, failing compilation with no indication of why.
            if (!matchedTools.add(endpoint.getToolName())) {
                throw new McpGenerationException(
                        "Multiple operations map to the same tool name: " + endpoint.getToolName());
            }
            selected.add(endpoint);
        }
        if (matchedTools.size() < requestedTools.size()) {
            List<String> unresolved = requestedTools.stream().filter(tool -> !matchedTools.contains(tool)).toList();
            throw new McpGenerationException(
                    "Selected tool(s) no longer exist in the OpenAPI specification: " + String.join(", ", unresolved));
        }
        return selected;
    }

    private static String propValue(ServiceInitModel model, String key, String fallback) {
        Value value = model.getProperties().get(key);
        return value == null || value.getValue() == null || value.getValue().isBlank() ? fallback : value.getValue();
    }

    /** Falls back to a codedata type/argType scan when the key is absent, so a key rename still resolves. */
    private static String resolveValue(ServiceInitModel model, String key, String codedataType, String fallback) {
        Map<String, Value> properties = model.getProperties();
        Value value = properties.get(key);
        if (value == null) {
            value = findByCodedataType(properties, codedataType);
        }
        return value == null || value.getValue() == null || value.getValue().isBlank() ? fallback : value.getValue();
    }

    private static Value findByCodedataType(Map<String, Value> properties, String codedataType) {
        for (Value field : properties.values()) {
            Codedata codedata = field.getCodedata();
            if (codedata != null
                    && (codedataType.equals(codedata.getType()) || codedataType.equals(codedata.getArgType()))) {
                return field;
            }
        }
        return null;
    }

    private static int parsePort(String value, int fallback) {
        try {
            return Integer.parseInt(value.trim());
        } catch (NumberFormatException ignored) {
            return fallback;
        }
    }

    private static String deriveServicePath(String title) {
        String path = title.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", "_")
                .replaceAll("^_|_$", "");
        return path.isBlank() ? "mcp" : path;
    }

    // JVM-global, so concurrent calls must not race on swapping/restoring System.out.
    private static final Object STDOUT_REDIRECT_LOCK = new Object();

    // Keeps mcp-core's System.out progress/warning noise out of the LS's diagnostic output (System.err).
    static <T> T runSilently(SilentAction<T> action) throws McpGenerationException, IOException {
        synchronized (STDOUT_REDIRECT_LOCK) {
            PrintStream originalOut = System.out;
            PrintStream sink = new PrintStream(OutputStream.nullOutputStream(), true, StandardCharsets.UTF_8);
            System.setOut(sink);
            try {
                return action.run();
            } finally {
                System.setOut(originalOut);
                sink.close();
            }
        }
    }

    @FunctionalInterface
    interface SilentAction<T> {
        T run() throws McpGenerationException, IOException;
    }
}
