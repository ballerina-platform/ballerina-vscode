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

package io.ballerina.flowmodelgenerator.core.expressioneditor;

import io.ballerina.flowmodelgenerator.core.expressioneditor.services.DebouncedExpressionEditorRequest;

import java.util.concurrent.CancellationException;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * Debouncing ensures that a task is only executed after a specified delay has passed since its last invocation,
 * cancelling any pending executions in between. This class follows the Singleton pattern, ensuring only one instance
 * exists across the application.
 *
 * @since 1.0.0
 */
public class Debouncer {
    // Time unit for the delay
    private static final TimeUnit TIME_UNIT = TimeUnit.MILLISECONDS;
    // Map to hold scheduled tasks
    private final ConcurrentHashMap<String, ScheduledTaskHolder<?>> delayedMap;

    // Single-thread scheduler to debounce tasks.
    private final ScheduledExecutorService scheduler;

    private Debouncer() {
        scheduler = Executors.newSingleThreadScheduledExecutor();
        delayedMap = new ConcurrentHashMap<>();
    }

    /**
     * Debounce the given DebouncedExpressionEditorApi request by scheduling it to execute after the provided delay.
     * Any previously scheduled task with the same key is cancelled.
     */
    public <T> CompletableFuture<T> debounce(DebouncedExpressionEditorRequest<T> request) {
        long delay = request.getDelay();
        String key = request.getKey();
        CompletableFuture<T> promise = new CompletableFuture<>();

        ScheduledTaskHolder<T> holder = new ScheduledTaskHolder<>(promise);

        // Schedule the task to run after the specified delay.
        Future<?> scheduledFuture = scheduler.schedule(() -> {
            try {
                T result = request.call();
                promise.complete(result);
            } catch (Exception ex) {
                promise.completeExceptionally(ex);
            } finally {
                if (promise.isCompletedExceptionally()) {
                    request.revertDocument();
                }
                delayedMap.remove(key, holder);
            }
        }, delay, TIME_UNIT);
        holder.setFuture(scheduledFuture);

        // Replace any existing scheduled task with the new one.
        @SuppressWarnings("unchecked")
        ScheduledTaskHolder<T> prev = (ScheduledTaskHolder<T>) delayedMap.put(key, holder);
        if (prev != null && prev.cancelPending()) {
            prev.promise().completeExceptionally(new CancellationException("Debounced by a new request"));
        }
        return promise;
    }

    public static Debouncer getInstance() {
        return Holder.INSTANCE;
    }

    private static class Holder {

        private static final Debouncer INSTANCE = new Debouncer();
    }

    /**
     * Mutable holder that lets a task remove only its own map entry while its Future is assigned after scheduling.
     * It prevents a superseded task's cleanup from removing a newer pending task's entry from the map.
     * Otherwise, the newer task cannot be cancelled and multiple tasks may run for the same key.
     *
     * @param <T> the type of result promised by the CompletableFuture.
     */
    private static final class ScheduledTaskHolder<T> {

        private final CompletableFuture<T> promise;
        private volatile Future<?> future;

        private ScheduledTaskHolder(CompletableFuture<T> promise) {
            this.promise = promise;
        }

        private CompletableFuture<T> promise() {
            return promise;
        }

        private void setFuture(Future<?> future) {
            this.future = future;
        }

        private boolean cancelPending() {
            Future<?> currentFuture = future;
            return currentFuture != null && currentFuture.cancel(false);
        }
    }
}
