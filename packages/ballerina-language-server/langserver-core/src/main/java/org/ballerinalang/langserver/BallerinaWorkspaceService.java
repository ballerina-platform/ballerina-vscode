/*
 * Copyright (c) 2017, WSO2 Inc. (http://wso2.com) All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package org.ballerinalang.langserver;

import com.google.gson.JsonObject;
import io.ballerina.projects.util.ProjectConstants;
import org.ballerinalang.langserver.command.LSCommandExecutorProvidersHolder;
import org.ballerinalang.langserver.common.utils.PathUtil;
import org.ballerinalang.langserver.commons.DidChangeWatchedFilesContext;
import org.ballerinalang.langserver.commons.DocumentServiceContext;
import org.ballerinalang.langserver.commons.ExecuteCommandContext;
import org.ballerinalang.langserver.commons.LanguageServerContext;
import org.ballerinalang.langserver.commons.capability.LSClientCapabilities;
import org.ballerinalang.langserver.commons.command.CommandArgument;
import org.ballerinalang.langserver.commons.command.LSCommandExecutorException;
import org.ballerinalang.langserver.commons.command.spi.LSCommandExecutor;
import org.ballerinalang.langserver.commons.eventsync.EventKind;
import org.ballerinalang.langserver.commons.eventsync.exceptions.EventSyncException;
import org.ballerinalang.langserver.commons.workspace.WorkspaceDocumentException;
import org.ballerinalang.langserver.config.LSClientConfigHolder;
import org.ballerinalang.langserver.contexts.ContextBuilder;
import org.ballerinalang.langserver.diagnostic.DiagnosticsHelper;
import org.ballerinalang.langserver.eventsync.EventSyncPubSubHolder;
import org.ballerinalang.langserver.exception.UserErrorException;
import org.ballerinalang.langserver.telemetry.TelemetryUtil;
import org.ballerinalang.langserver.workspace.BallerinaWorkspaceManagerProxy;
import org.eclipse.lsp4j.DidChangeConfigurationParams;
import org.eclipse.lsp4j.DidChangeWatchedFilesParams;
import org.eclipse.lsp4j.ExecuteCommandParams;
import org.eclipse.lsp4j.FileChangeType;
import org.eclipse.lsp4j.FileEvent;
import org.eclipse.lsp4j.Position;
import org.eclipse.lsp4j.services.WorkspaceService;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.CompletableFuture;

/**
 * Workspace service implementation for Ballerina.
 */
public class BallerinaWorkspaceService implements WorkspaceService {

    private final BallerinaLanguageServer languageServer;
    private final LSClientConfigHolder configHolder;
    private LSClientCapabilities clientCapabilities;
    private final BallerinaWorkspaceManagerProxy workspaceManagerProxy;
    private final LanguageServerContext serverContext;
    private final LSClientLogger clientLogger;

    BallerinaWorkspaceService(BallerinaLanguageServer languageServer,
                              BallerinaWorkspaceManagerProxy workspaceManagerProxy,
                              LanguageServerContext serverContext) {
        this.languageServer = languageServer;
        this.workspaceManagerProxy = workspaceManagerProxy;
        this.serverContext = serverContext;
        this.configHolder = LSClientConfigHolder.getInstance(this.serverContext);
        this.clientLogger = LSClientLogger.getInstance(this.serverContext);
    }

    public void setClientCapabilities(LSClientCapabilities clientCapabilities) {
        this.clientCapabilities = clientCapabilities;
    }

    @Override
    public void didChangeConfiguration(DidChangeConfigurationParams params) {
        if (!(params.getSettings() instanceof JsonObject settings)) {
            return;
        }
        if (settings.get("ballerina") != null) {
            configHolder.updateConfig(settings.get("ballerina"));
        } else {
            // To support old plugins versions
            configHolder.updateConfig(settings);
        }
    }

    @Override
    public void didChangeWatchedFiles(DidChangeWatchedFilesParams params) {
        try {
            List<Path> paths = this.workspaceManagerProxy.get().didChangeWatched(params);
            publishProjectReloads(params, paths);
            LSClientCapabilities lsClientCapabilities = this.serverContext.get(LSClientCapabilities.class);
            // Don't publish diagnostics on lightweight mode
            if (!lsClientCapabilities.getInitializationOptions().isEnableLightWeightMode()) {
                DidChangeWatchedFilesContext context =
                        ContextBuilder.buildDidChangeWatchedFilesContext(
                                this.workspaceManagerProxy.get(),
                                this.serverContext);
                DiagnosticsHelper diagnosticsHelper = DiagnosticsHelper.getInstance(this.serverContext);
                // project roots are the reloaded project roots. Hence we re-publish the diagnostics.
                for (Path projectRoot : paths) {
                    diagnosticsHelper.schedulePublishDiagnostics(this.languageServer.getClient(), context, projectRoot);
                }
            }
        } catch (WorkspaceDocumentException e) {
            String msg = "Operation 'workspace/didChangeWatchedFiles' failed!";
            this.clientLogger.logError(LSContextOperation.WS_WF_CHANGED, msg, e, null, (Position) null);
        }
    }

    // A file changed outside the editor (a git checkout) reloads its project; subscribers such as artifact
    // publishing only learn of it through this event.
    private void publishProjectReloads(DidChangeWatchedFilesParams params, List<Path> projectRoots) {
        Set<Path> published = new HashSet<>();
        for (FileEvent change : params.getChanges()) {
            Optional<Path> changedPath = PathUtil.getPathFromURI(change.getUri());
            Optional<Path> projectRoot = changedPath
                    .flatMap(path -> projectRoots.stream().filter(path::startsWith).findFirst());
            if (projectRoot.isEmpty()) {
                continue;
            }
            // A deleted file cannot locate its project, so the reload is reported against the package manifest.
            Path manifest = projectRoot.get().resolve(ProjectConstants.BALLERINA_TOML);
            boolean deleted = change.getType() == FileChangeType.Deleted;
            // A project the user never opened is not reloaded, so it must not be loaded here either.
            boolean loaded = (!deleted || Files.exists(manifest))
                    && this.workspaceManagerProxy.get().project(deleted ? manifest : changedPath.get()).isPresent();
            if (!loaded || !published.add(projectRoot.get())) {
                continue;
            }
            String uri = deleted ? manifest.toUri().toString() : change.getUri();
            DocumentServiceContext context = ContextBuilder.buildDocumentServiceContext(uri,
                    this.workspaceManagerProxy.get(), LSContextOperation.RELOAD_PROJECT, this.serverContext);
            try {
                EventSyncPubSubHolder.getInstance(this.serverContext)
                        .getPublisher(EventKind.PROJECT_UPDATE)
                        .publish(this.languageServer.getClient(), this.serverContext, context);
            } catch (EventSyncException e) {
                this.clientLogger.logError(LSContextOperation.WS_WF_CHANGED, "Failed to publish the project reload",
                        e, null, (Position) null);
            }
        }
    }

    @Override
    public CompletableFuture<Object> executeCommand(ExecuteCommandParams params) {
        return CompletableFuture.supplyAsync(() -> {
            List<CommandArgument> commandArguments = params.getArguments().stream()
                    .map(CommandArgument::from)
                    .toList();
            ExecuteCommandContext context = ContextBuilder.buildExecuteCommandContext(this.workspaceManagerProxy.get(),
                    this.serverContext,
                    commandArguments,
                    this.clientCapabilities,
                    this.languageServer);

            try {
                Optional<LSCommandExecutor> executor = LSCommandExecutorProvidersHolder.getInstance(this.serverContext)
                        .getCommandExecutor(params.getCommand());
                if (executor.isPresent()) {
                    LSCommandExecutor commandExecutor = executor.get();
                    Object result = commandExecutor.execute(context);
                    // Send feature usage telemetry event if applicable
                    TelemetryUtil.featureUsageEventFromCommandExecutor(commandExecutor)
                            .ifPresent(lsFeatureUsageTelemetryEvent ->
                                    TelemetryUtil.sendTelemetryEvent(context.languageServercontext(),
                                            lsFeatureUsageTelemetryEvent));
                    return result;
                }
            } catch (UserErrorException e) {
                this.clientLogger.notifyUser("Execute Command", e);
            } catch (Throwable e) {
                String msg = "Operation 'workspace/executeCommand' failed!";
                this.clientLogger.logError(LSContextOperation.WS_EXEC_CMD, msg, e, null, (Position) null);
            }
            this.clientLogger.logError(LSContextOperation.WS_EXEC_CMD, "Operation 'workspace/executeCommand' failed!",
                    new LSCommandExecutorException(
                            "No command executor found for '" + params.getCommand() + "'"),
                    null, (Position) null);
            return false;
        });
    }
}
