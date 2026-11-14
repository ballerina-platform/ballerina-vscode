/*
 *  Copyright (c) 2022, WSO2 Inc. (http://www.wso2.org) All Rights Reserved.
 *
 *  WSO2 Inc. licenses this file to you under the Apache License,
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
package org.ballerinalang.langserver.eventsync.subscribers;

import org.ballerinalang.annotation.JavaSPIService;
import org.ballerinalang.langserver.common.utils.CommonUtil;
import org.ballerinalang.langserver.commons.DocumentServiceContext;
import org.ballerinalang.langserver.commons.LanguageServerContext;
import org.ballerinalang.langserver.commons.capability.LSClientCapabilities;
import org.ballerinalang.langserver.commons.client.ExtendedLanguageClient;
import org.ballerinalang.langserver.commons.eventsync.EventKind;
import org.ballerinalang.langserver.commons.eventsync.spi.EventSubscriber;
import org.ballerinalang.langserver.diagnostic.DiagnosticsHelper;

import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executor;
import java.util.concurrent.TimeUnit;

/**
 * Publishes diagnostics.
 *
 * @since 1.0.0
 */
@JavaSPIService("org.ballerinalang.langserver.commons.eventsync.spi.EventSubscriber")
public class PublishDiagnosticSubscriber implements EventSubscriber {

    public static final String NAME = "Publish diagnostic subscriber";
    private CompletableFuture<Boolean> latestScheduled = null;
    private static final long DIAGNOSTIC_DELAY = 1;

    @Override
    public EventKind eventKind() {
        return EventKind.PROJECT_UPDATE;
    }

    @Override
    public void onEvent(ExtendedLanguageClient client, DocumentServiceContext context,
                        LanguageServerContext languageServerContext) {
        // Skip clone schemes: they would cancel a pending file:// publish and clear its diagnostics.
        // ai:// is already dropped by ProjectUpdateEventPublisher; this check is only a guard.
        String uriScheme = context.workspace().uriScheme();
        if (CommonUtil.EXPR_SCHEME.equals(uriScheme) || CommonUtil.AI_SCHEME.equals(uriScheme)) {
            return;
        }

        LSClientCapabilities lsClientCapabilities = context.languageServercontext().get(LSClientCapabilities.class);
        if (lsClientCapabilities == null ||
                !lsClientCapabilities.getInitializationOptions().isEnableLightWeightMode()) {
            // TODO: This is a legacy debouncer that does not consider multiple projects. Reuse the existing
            //  debouncer for diagnostics as well.
            if (latestScheduled != null && !latestScheduled.isDone()) {
                latestScheduled.completeExceptionally(new Throwable("Cancelled diagnostic publishing"));
            }

            Executor delayedExecutor = CompletableFuture.delayedExecutor(DIAGNOSTIC_DELAY, TimeUnit.SECONDS);
            CompletableFuture<Boolean> scheduledFuture = CompletableFuture.supplyAsync(() -> true, delayedExecutor);
            latestScheduled = scheduledFuture;
            scheduledFuture.thenAcceptAsync(aBoolean -> {
                DiagnosticsHelper diagnosticsHelper = DiagnosticsHelper.getInstance(languageServerContext);
                diagnosticsHelper.compileAndSendDiagnostics(client, context);
            });
        }
    }

    @Override
    public String getName() {
        return NAME;
    }
}
