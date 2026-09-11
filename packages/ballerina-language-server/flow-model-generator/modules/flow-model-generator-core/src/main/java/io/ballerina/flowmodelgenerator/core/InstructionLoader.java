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

package io.ballerina.flowmodelgenerator.core;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.Optional;
import java.util.stream.Collectors;

/**
 * Utility class for loading custom instructions from resource files.
 * Instructions are organized by package in the resources/copilot/instructions directory.
 *
 * <p>Directory structure:
 * <pre>
 * resources/copilot/instructions/
 *   └── {org}/
 *       └── {module}/
 *           ├── library.md      → Library.instructions
 *           └── service.md      → GenericService.instructions
 * </pre>
 *
 * <p>The {@code test.md} channel was retired. No instance had existed since the curated corpus was
 * removed, and test conventions live in {@code ballerina/test}'s own {@code library.md}, which every
 * test-writing prompt already names.
 *
 * @since 1.7.0
 */
public final class InstructionLoader {

    private static final String INSTRUCTIONS_BASE_PATH = "/copilot/instructions";
    private static final String LIBRARY_INSTRUCTION_FILE = "library.md";
    private static final String SERVICE_INSTRUCTION_FILE = "service.md";

    private InstructionLoader() {
        // Utility class, prevent instantiation
    }

    /**
     * Loads the library instruction for a given package.
     *
     * @param packageName the full package name (e.g., "ballerina/http")
     * @return Optional containing the instruction content, or empty if not found
     */
    public static Optional<String> loadLibraryInstruction(String packageName) {
        return loadInstruction(packageName, LIBRARY_INSTRUCTION_FILE);
    }

    /**
     * Loads the service instruction for a given package.
     *
     * @param packageName the full package name (e.g., "ballerina/http")
     * @return Optional containing the instruction content, or empty if not found
     */
    public static Optional<String> loadServiceInstruction(String packageName) {
        return loadInstruction(packageName, SERVICE_INSTRUCTION_FILE);
    }

    /**
     * Loads an instruction file from the resources.
     *
     * @param packageName the full package name (e.g., "ballerina/http")
     * @param fileName    the instruction file name (e.g., "library.md")
     * @return Optional containing the instruction content, or empty if not found
     */
    private static Optional<String> loadInstruction(String packageName, String fileName) {
        String resourcePath = buildResourcePath(packageName, fileName);
        try (InputStream inputStream = InstructionLoader.class.getResourceAsStream(resourcePath)) {
            if (inputStream == null) {
                return Optional.empty();
            }
            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(inputStream, StandardCharsets.UTF_8))) {
                String content = reader.lines().collect(Collectors.joining("\n"));
                return content.isEmpty() ? Optional.empty() : Optional.of(content);
            }
        } catch (IOException e) {
            return Optional.empty();
        }
    }

    /**
     * Builds the resource path for an instruction file.
     *
     * @param packageName the full package name (e.g., "ballerina/http")
     * @param fileName    the instruction file name
     * @return the full resource path
     */
    private static String buildResourcePath(String packageName, String fileName) {
        // Package name format: "org/module" (e.g., "ballerina/http")
        // Resource path: /copilot/instructions/org/module/filename.md
        return INSTRUCTIONS_BASE_PATH + "/" + packageName + "/" + fileName;
    }
}
