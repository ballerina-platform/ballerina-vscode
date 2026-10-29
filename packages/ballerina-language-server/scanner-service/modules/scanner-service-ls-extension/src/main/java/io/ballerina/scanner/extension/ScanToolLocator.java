/*
 *  Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com)
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

package io.ballerina.scanner.extension;

import io.ballerina.toml.api.Toml;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Stream;

/**
 * Finds the jar of the active {@code bal scan} tool from the user's {@code bal-tools.toml}.
 *
 * @since 1.8.0
 */
final class ScanToolLocator {

    static final String TOOL_JAR_PROPERTY = "ballerina.scan.toolJar";

    private static final String SCAN_TOOL_ID = "scan";
    private static final String LOCAL_REPOSITORY = "local";
    private static final String CENTRAL_REPOSITORY = "central.ballerina.io";
    private static final String TOOL_JAR_PREFIX = "scan-command";

    private ScanToolLocator() {
    }

    /**
     * Locates the scan tool jar.
     *
     * @param homeReposPath the user's {@code .ballerina} directory
     * @return the jar and the tool version, or empty when no scan tool is active
     */
    static Optional<LocatedTool> locate(Path homeReposPath) {
        String override = System.getProperty(TOOL_JAR_PROPERTY);
        if (override != null && !override.isBlank()) {
            Path jar = Path.of(override);
            return Files.isRegularFile(jar) ? Optional.of(new LocatedTool(jar, "dev")) : Optional.empty();
        }

        Path balToolsToml = homeReposPath.resolve(".config").resolve("bal-tools.toml");
        if (!Files.isRegularFile(balToolsToml)) {
            return Optional.empty();
        }
        List<Toml> tools;
        try {
            tools = Toml.read(balToolsToml).getTables("tool");
        } catch (IOException | RuntimeException e) {
            return Optional.empty();
        }
        for (Toml tool : tools) {
            Map<String, Object> properties = tool.toMap();
            if (SCAN_TOOL_ID.equals(properties.get("id")) && Boolean.TRUE.equals(properties.get("active"))) {
                return findJar(homeReposPath, properties);
            }
        }
        return Optional.empty();
    }

    private static Optional<LocatedTool> findJar(Path homeReposPath, Map<String, Object> tool) {
        if (!(tool.get("org") instanceof String org) || !(tool.get("name") instanceof String name)
                || !(tool.get("version") instanceof String version)) {
            return Optional.empty();
        }
        String repository = LOCAL_REPOSITORY.equals(tool.get("repository")) ? LOCAL_REPOSITORY : CENTRAL_REPOSITORY;
        Path versionDir = homeReposPath.resolve("repositories").resolve(repository).resolve("bala")
                .resolve(org).resolve(name).resolve(version);
        if (!Files.isDirectory(versionDir)) {
            return Optional.empty();
        }
        // A tool bala holds one platform directory, such as java21 or any, with the jars under tool/libs.
        try (Stream<Path> platforms = Files.list(versionDir)) {
            return platforms.map(platform -> platform.resolve("tool").resolve("libs"))
                    .filter(Files::isDirectory)
                    .flatMap(ScanToolLocator::listJars)
                    .filter(jar -> jar.toFile().getName().startsWith(TOOL_JAR_PREFIX))
                    .findFirst()
                    .map(jar -> new LocatedTool(jar, version));
        } catch (IOException e) {
            return Optional.empty();
        }
    }

    private static Stream<Path> listJars(Path libsDir) {
        try (Stream<Path> files = Files.list(libsDir)) {
            return files.filter(file -> file.toFile().getName().endsWith(".jar")).toList().stream();
        } catch (IOException e) {
            return Stream.empty();
        }
    }

    /**
     * The located scan tool.
     *
     * @param jar     the scan tool jar
     * @param version the tool version from {@code bal-tools.toml}
     */
    record LocatedTool(Path jar, String version) {
    }
}
