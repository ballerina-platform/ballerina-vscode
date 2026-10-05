/*
 *  Copyright (c) 2025, WSO2 LLC. (http://www.wso2.com)
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

package io.ballerina.flowmodelgenerator.core.diagnostics;

import com.google.gson.JsonElement;

import java.util.concurrent.CancellationException;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * Debouncing specifically designed for diagnostics requests in the Flow Model. This debouncer ensures that diagnostics
 * processing is only executed after a specified delay has passed since the last invocation, cancelling any pending
 * executions in between. This class follows the Singleton pattern, ensuring only one instance exists across the
 * application for diagnostics operations.
 *
 * @since 1.0.0
 */
public class DiagnosticsDebouncer {

    // Time unit for the delay
    private static final TimeUnit TIME_UNIT = TimeUnit.MILLISECONDS;

    // Requests come from blur and submit, not keystrokes; queued requests are still coalesced on the single thread.
    private static final long DELAY = 0;

    // Map to hold scheduled diagnostics tasks
    private final ConcurrentHashMap<String, ScheduledDiagnosticsTaskHolder<?>> delayedMap;

    // Single-thread scheduler to debounce diagnostics tasks.
    private final ScheduledExecutorService scheduler;

    private DiagnosticsDebouncer() {
        scheduler = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "DiagnosticsDebouncer");
            t.setDaemon(true);
            return t;
        });
        delayedMap = new ConcurrentHashMap<>();
    }

    /**
     * Debounce the given diagnostics request by scheduling it to execute after the default delay. Any previously
     * scheduled task with the same key is cancelled.
     *
     * @param request the diagnostics request to debounce
     * @return a CompletableFuture that will complete with the result of the diagnostics operation
     */
    public CompletableFuture<JsonElement> debounce(DiagnosticRequest request) {
        String key = request.getKey();
        CompletableFuture<JsonElement> promise = new CompletableFuture<>();

        // Schedule the task to run after the default delay.
        Future<?> scheduledFuture = scheduler.schedule(() -> {
            try {
                JsonElement result = request.call();
                promise.complete(result);
            } catch (Exception ex) {
                promise.completeExceptionally(ex);
            } finally {
                request.revertDocument();
                delayedMap.remove(key);
            }
        }, DELAY, TIME_UNIT);

        // Replace any existing scheduled task with the new one.
        @SuppressWarnings("unchecked")
        ScheduledDiagnosticsTaskHolder<JsonElement> prev =
                (ScheduledDiagnosticsTaskHolder<JsonElement>) delayedMap.put(key,
                        new ScheduledDiagnosticsTaskHolder<>(promise, scheduledFuture));
        // A request that already started runs to completion; interrupting it mid-compilation helps nobody.
        if (prev != null && prev.future().cancel(false)) {
            prev.promise().completeExceptionally(new CancellationException("Debounced by a new diagnostics request"));
        }
        return promise;
    }

    /**
     * Get the singleton instance of DiagnosticsDebouncer.
     *
     * @return the DiagnosticsDebouncer instance
     */
    public static DiagnosticsDebouncer getInstance() {
        return Holder.INSTANCE;
    }

    private static class Holder {

        private static final DiagnosticsDebouncer INSTANCE = new DiagnosticsDebouncer();
    }

    /**
     * Holder for scheduled diagnostics task information.
     *
     * @param <T>     the type of result promised by the CompletableFuture.
     * @param promise the CompletableFuture that will eventually complete with the result of the scheduled diagnostics
     *                task.
     * @param future  the Future representing the scheduled diagnostics task, allowing for control over task execution.
     */
    private record ScheduledDiagnosticsTaskHolder<T>(CompletableFuture<T> promise, Future<?> future) {
    }
}
