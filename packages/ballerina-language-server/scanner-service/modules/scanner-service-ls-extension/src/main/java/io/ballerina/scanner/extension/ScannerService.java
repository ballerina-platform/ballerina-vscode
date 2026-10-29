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

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import io.ballerina.scanner.extension.request.ProjectRequest;
import io.ballerina.scanner.extension.request.RuleEditRequest;
import io.ballerina.scanner.extension.request.ScanRequest;
import org.ballerinalang.annotation.JavaSPIService;
import org.ballerinalang.langserver.commons.service.spi.ExtendedLanguageServerService;
import org.ballerinalang.langserver.commons.workspace.WorkspaceManager;
import org.eclipse.lsp4j.jsonrpc.services.JsonRequest;
import org.eclipse.lsp4j.jsonrpc.services.JsonSegment;
import org.eclipse.lsp4j.services.LanguageServer;
import org.wso2.ballerinalang.util.RepoUtils;

import java.lang.reflect.Method;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Runs the {@code bal scan} tool for the IDE. It only returns scan results and Scan.toml edits; the client owns how
 * they are shown, so scan findings never replace the compiler diagnostics this server publishes.
 *
 * @since 1.8.0
 */
@JavaSPIService("org.ballerinalang.langserver.commons.service.spi.ExtendedLanguageServerService")
@JsonSegment("scanner")
public class ScannerService implements ExtendedLanguageServerService {

    // One thread: a scan compiles the whole package, so concurrent scans only compete for memory.
    private final ExecutorService executor = Executors.newSingleThreadExecutor(runnable -> {
        Thread thread = new Thread(runnable, "ballerina-scanner");
        thread.setDaemon(true);
        return thread;
    });
    private final ScanTool scanTool;

    public ScannerService() {
        this(new ScanTool(() -> ScanToolLocator.locate(RepoUtils.createAndGetHomeReposPath())));
    }

    ScannerService(ScanTool scanTool) {
        this.scanTool = scanTool;
    }

    @Override
    public void init(LanguageServer langServer, WorkspaceManager workspaceManager) {
    }

    @Override
    public Class<?> getRemoteInterface() {
        return null;
    }

    @Override
    public void shutdown() {
        executor.shutdownNow();
        scanTool.close();
    }

    /**
     * Reports whether a compatible scan tool is installed.
     *
     * @return the tool status
     */
    @JsonRequest
    public CompletableFuture<JsonObject> handshake() {
        return CompletableFuture.supplyAsync(() -> {
            JsonObject response = new JsonObject();
            response.addProperty("supportedApiVersion", ScanTool.SUPPORTED_API_VERSION);
            try {
                ScanTool.Loaded tool = scanTool.get();
                response.addProperty("available", true);
                response.addProperty("toolVersion", tool.version());
                response.addProperty("apiVersion", tool.apiVersion());
            } catch (ScanTool.ScanToolUnavailableException e) {
                response.addProperty("available", false);
                response.addProperty("code", e.code());
                response.addProperty("error", e.getMessage());
            }
            return response;
        }, executor);
    }

    /**
     * Scans a package, or every package of a workspace.
     *
     * @param request the scan request
     * @return the scan result, with the issue fields of the HTML report and, when requested, the report path
     */
    @JsonRequest
    public CompletableFuture<JsonObject> scan(ScanRequest request) {
        return submit(tool -> tool.invoke(tool.scan(), request.projectPath(),
                Map.of("offline", request.offline(), "report", request.report())));
    }

    /**
     * Computes the Scan.toml content that excludes a rule, without writing it.
     *
     * @param request the rule edit request
     * @return the edit
     */
    @JsonRequest
    public CompletableFuture<JsonObject> excludeRuleEdit(RuleEditRequest request) {
        return submit(tool -> invokeRuleEdit(tool, tool.excludeRuleEdit(), request));
    }

    /**
     * Computes the Scan.toml content that stops excluding a rule, without writing it.
     *
     * @param request the rule edit request
     * @return the edit
     */
    @JsonRequest
    public CompletableFuture<JsonObject> includeRuleEdit(RuleEditRequest request) {
        return submit(tool -> invokeRuleEdit(tool, tool.includeRuleEdit(), request));
    }

    /**
     * Computes the Scan.toml content that applies {@code @scan:Suppress} annotations again, without writing it.
     *
     * @param request the package whose Scan.toml to edit
     * @return the edit
     */
    @JsonRequest
    public CompletableFuture<JsonObject> enableSuppressionEdit(ProjectRequest request) {
        return submit(tool -> tool.invoke(tool.enableSuppressionEdit(), request.projectPath()));
    }

    private static String invokeRuleEdit(ScanTool.Loaded tool, Method method, RuleEditRequest request)
            throws Throwable {
        return tool.invoke(method, request.projectPath(), request.ruleId());
    }

    private CompletableFuture<JsonObject> submit(ToolCall call) {
        CompletableFuture<JsonObject> future = new CompletableFuture<>();
        executor.execute(() -> {
            // A request the client cancelled while it waited behind another scan is dropped unrun.
            if (future.isCancelled()) {
                return;
            }
            try {
                future.complete(JsonParser.parseString(call.run(scanTool.get())).getAsJsonObject());
            } catch (ScanTool.ScanToolUnavailableException e) {
                future.complete(error(e.code(), e.getMessage()));
            } catch (Throwable e) {
                String message = e.getMessage() != null ? e.getMessage() : e.toString();
                future.complete(error("SCAN_FAILED", message));
            }
        });
        return future;
    }

    private static JsonObject error(String code, String message) {
        JsonObject response = new JsonObject();
        response.addProperty("success", false);
        response.addProperty("code", code);
        response.addProperty("error", message);
        return response;
    }

    @FunctionalInterface
    private interface ToolCall {
        String run(ScanTool.Loaded tool) throws Throwable;
    }
}
