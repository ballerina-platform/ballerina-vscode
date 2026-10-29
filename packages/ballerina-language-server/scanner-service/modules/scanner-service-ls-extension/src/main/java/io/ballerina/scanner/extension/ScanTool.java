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

import java.io.IOException;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.net.URL;
import java.net.URLClassLoader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.Optional;
import java.util.function.Supplier;

/**
 * Loads the scan tool jar at runtime and calls its language server entry points, so rule updates ship with the tool
 * rather than with the language server.
 *
 * @since 1.8.0
 */
class ScanTool {

    static final int SUPPORTED_API_VERSION = 1;

    private static final String ENTRY_POINT_CLASS = "io.ballerina.scan.internal.ScanLanguageServerTool";

    private final Supplier<Optional<ScanToolLocator.LocatedTool>> locator;
    private Loaded loaded;

    ScanTool(Supplier<Optional<ScanToolLocator.LocatedTool>> locator) {
        this.locator = locator;
    }

    /**
     * Returns the loaded tool, reloading it when the active tool changed since the last call.
     *
     * @return the loaded tool
     * @throws ScanToolUnavailableException when no compatible scan tool is installed
     */
    synchronized Loaded get() throws ScanToolUnavailableException {
        ScanToolLocator.LocatedTool located = locator.get().orElseThrow(() -> new ScanToolUnavailableException(
                "TOOL_NOT_FOUND", "The scan tool is not installed. Run 'bal tool pull scan' to install it."));
        long lastModified = lastModified(located.jar());
        if (loaded != null && loaded.jar().equals(located.jar()) && loaded.lastModified() == lastModified) {
            return loaded;
        }
        close();
        loaded = load(located, lastModified);
        return loaded;
    }

    synchronized void close() {
        if (loaded == null) {
            return;
        }
        try {
            loaded.classLoader().close();
        } catch (IOException ignored) {
            // Closing only releases the jar handle; a failure leaves nothing to clean up.
        }
        loaded = null;
    }

    private static Loaded load(ScanToolLocator.LocatedTool located, long lastModified)
            throws ScanToolUnavailableException {
        URLClassLoader classLoader;
        try {
            classLoader = new URLClassLoader(new URL[]{located.jar().toUri().toURL()},
                    ScanTool.class.getClassLoader());
        } catch (IOException e) {
            throw new ScanToolUnavailableException("TOOL_NOT_FOUND", "Cannot read the scan tool jar at "
                    + located.jar() + ": " + e.getMessage());
        }
        try {
            Class<?> entryPoint = classLoader.loadClass(ENTRY_POINT_CLASS);
            int apiVersion = (int) entryPoint.getMethod("apiVersion").invoke(null);
            if (apiVersion != SUPPORTED_API_VERSION) {
                throw incompatible(located, classLoader, "it provides API version " + apiVersion
                        + ", but this language server supports version " + SUPPORTED_API_VERSION);
            }
            return new Loaded(located.jar(), located.version(), apiVersion, lastModified, classLoader,
                    entryPoint.getMethod("scan", String.class, Map.class),
                    entryPoint.getMethod("excludeRuleEdit", String.class, String.class),
                    entryPoint.getMethod("includeRuleEdit", String.class, String.class),
                    entryPoint.getMethod("enableSuppressionEdit", String.class));
        } catch (ReflectiveOperationException | ClassCastException e) {
            throw incompatible(located, classLoader, "it has no language server entry point");
        }
    }

    private static ScanToolUnavailableException incompatible(ScanToolLocator.LocatedTool located,
                                                             URLClassLoader classLoader, String reason) {
        try {
            classLoader.close();
        } catch (IOException ignored) {
            // The loader is discarded either way.
        }
        return new ScanToolUnavailableException("TOOL_INCOMPATIBLE", "The installed scan tool "
                + located.version() + " cannot be used because " + reason
                + ". Run 'bal tool update scan' to update it.");
    }

    private static long lastModified(Path jar) {
        try {
            return Files.getLastModifiedTime(jar).toMillis();
        } catch (IOException e) {
            return -1;
        }
    }

    /**
     * A loaded scan tool and its entry points.
     *
     * @param jar                   the loaded jar
     * @param version               the tool version
     * @param apiVersion            the API version the tool provides
     * @param lastModified          the jar modification time when it was loaded
     * @param classLoader           the class loader that holds the tool
     * @param scan                  the scan entry point
     * @param excludeRuleEdit       the entry point that computes a rule exclusion edit
     * @param includeRuleEdit       the entry point that computes a rule inclusion edit
     * @param enableSuppressionEdit the entry point that computes the edit that enables suppressions
     */
    record Loaded(Path jar, String version, int apiVersion, long lastModified, URLClassLoader classLoader,
                  Method scan, Method excludeRuleEdit, Method includeRuleEdit, Method enableSuppressionEdit) {

        String invoke(Method method, Object... args) throws Throwable {
            Thread thread = Thread.currentThread();
            ClassLoader original = thread.getContextClassLoader();
            thread.setContextClassLoader(classLoader);
            try {
                return (String) method.invoke(null, args);
            } catch (InvocationTargetException e) {
                throw e.getCause() != null ? e.getCause() : e;
            } finally {
                thread.setContextClassLoader(original);
            }
        }
    }

    /**
     * Thrown when no compatible scan tool can be loaded.
     */
    static class ScanToolUnavailableException extends Exception {

        private final String code;

        ScanToolUnavailableException(String code, String message) {
            super(message);
            this.code = code;
        }

        String code() {
            return code;
        }
    }
}
