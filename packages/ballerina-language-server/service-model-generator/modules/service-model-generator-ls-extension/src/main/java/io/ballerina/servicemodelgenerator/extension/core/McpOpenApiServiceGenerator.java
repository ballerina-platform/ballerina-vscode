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

import io.ballerina.mcp.core.generator.GeneratorOptions;
import io.ballerina.mcp.core.generator.MainBalGenerator;
import io.ballerina.mcp.core.generator.McpGenerationException;
import io.ballerina.mcp.core.generator.McpProjectGenerator;
import io.ballerina.mcp.core.generator.OpenApiSpecParser;
import io.ballerina.mcp.core.model.EndpointInfo;
import io.ballerina.mcp.core.model.SpecInfo;
import io.ballerina.servicemodelgenerator.extension.model.McpServiceDefaults;
import io.ballerina.servicemodelgenerator.extension.model.ServiceInitModel;
import io.ballerina.servicemodelgenerator.extension.model.Value;
import io.ballerina.servicemodelgenerator.extension.util.Utils;
import io.ballerina.tools.text.LinePosition;
import org.eclipse.lsp4j.TextEdit;

import java.io.IOException;
import java.io.OutputStream;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

/** Generates a proxy MCP service from a selected subset of an OpenAPI contract. */
public class McpOpenApiServiceGenerator {

    private static final String OPENAPI = "openapi";
    private static final String TYPES_BAL = "types.bal";
    private static final int DEFAULT_PORT = 9090;
    private static final String DEFAULT_LISTENER_NAME = "mcpListener";
    private static final String DEFAULT_SERVICE_NAME = "Proxy Service";
    private static final String DEFAULT_VERSION = "1.0.0";
    private static final Pattern SERVICE_PATH_PATTERN =
            Pattern.compile("(service\\s+mcp:Service\\s+)\\S+(\\s+on\\s+mcpListener)");

    private final Path specPath;
    private final Path projectPath;

    public McpOpenApiServiceGenerator(Path specPath, Path projectPath) {
        this.specPath = specPath;
        this.projectPath = projectPath;
    }

    public Map<String, List<TextEdit>> generateService(ServiceInitModel model)
            throws McpGenerationException, IOException {
        SpecInfo fullSpec = runSilently(() -> new OpenApiSpecParser().parse(specPath));
        List<EndpointInfo> endpoints = selectedEndpoints(fullSpec.getEndpoints(), model.getSelectedTools());
        McpServiceDefaults defaults = defaultsFor(fullSpec);
        String serviceName = propValue(model, "serviceName", defaults.serviceName());
        String version = propValue(model, "version", defaults.version());
        int port = parsePort(propValue(model, "listenTo", String.valueOf(defaults.port())), defaults.port());
        String listenerName = propValue(model, "listenerVarName", defaults.listenerName());

        SpecInfo filteredSpec = new SpecInfo(fullSpec.getBaseUrl(), port, serviceName, version, endpoints);
        String serviceSource = runSilently(() -> new MainBalGenerator().generate(filteredSpec));
        String basePath = propValue(model, "basePath", null);
        if (basePath != null && !basePath.isBlank()) {
            String normalized = basePath.startsWith("/") ? basePath : "/" + basePath;
            serviceSource = SERVICE_PATH_PATTERN.matcher(serviceSource)
                    .replaceFirst("$1" + Matcher.quoteReplacement(normalized) + "$2");
        }
        serviceSource = serviceSource.replace(DEFAULT_LISTENER_NAME, listenerName)
                .replace("new (" + DEFAULT_PORT + ")", "new (" + port + ")");

        Map<String, List<TextEdit>> edits = new LinkedHashMap<>();
        String base = sanitize(serviceName);
        edits.put(projectPath.resolve(base + ".bal").toAbsolutePath().toString(),
                List.of(new TextEdit(Utils.toRange(LinePosition.from(0, 0)), serviceSource)));
        String typesSource = generateTypes();
        if (!typesSource.isBlank()) {
            edits.put(projectPath.resolve(base + "_types.bal").toAbsolutePath().toString(),
                    List.of(new TextEdit(Utils.toRange(LinePosition.from(0, 0)), typesSource)));
        }
        return edits;
    }

    public static McpServiceDefaults defaultsFor(SpecInfo specInfo) {
        String serviceName = Objects.requireNonNullElse(specInfo.getTitle(), DEFAULT_SERVICE_NAME);
        String version = Objects.requireNonNullElse(specInfo.getVersion(), DEFAULT_VERSION);
        return new McpServiceDefaults(serviceName.isBlank() ? DEFAULT_SERVICE_NAME : serviceName,
                version.isBlank() ? DEFAULT_VERSION : version,
                "/" + deriveServicePath(serviceName), DEFAULT_PORT, DEFAULT_LISTENER_NAME);
    }

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
            }
        }
    }

    private static List<EndpointInfo> selectedEndpoints(List<EndpointInfo> endpoints, List<String> selectedTools) {
        if (selectedTools == null || selectedTools.isEmpty()) {
            return endpoints;
        }
        List<EndpointInfo> selected = new ArrayList<>();
        for (EndpointInfo endpoint : endpoints) {
            if (selectedTools.contains(endpoint.getToolName())) {
                selected.add(endpoint);
            }
        }
        return selected;
    }

    private static String propValue(ServiceInitModel model, String key, String fallback) {
        Value value = model.getProperties().get(key);
        return value == null || value.getValue() == null || value.getValue().isBlank() ? fallback : value.getValue();
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

    private static String sanitize(String name) {
        String sanitized = name.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", "_")
                .replaceAll("^_|_$", "");
        return sanitized.isBlank() ? "mcp_service" : sanitized;
    }

    static <T> T runSilently(SilentAction<T> action) throws McpGenerationException, IOException {
        PrintStream originalOut = System.out;
        PrintStream originalErr = System.err;
        PrintStream sink = new PrintStream(OutputStream.nullOutputStream(), true, StandardCharsets.UTF_8);
        System.setOut(sink);
        System.setErr(sink);
        try {
            return action.run();
        } finally {
            System.setOut(originalOut);
            System.setErr(originalErr);
            sink.close();
        }
    }

    @FunctionalInterface
    interface SilentAction<T> {
        T run() throws McpGenerationException, IOException;
    }
}
