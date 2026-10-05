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

package io.ballerina.artifactsgenerator;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CancellationException;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * Debouncer for artifact generation to ensure artifacts are only generated after a specified delay has passed since the
 * last request for the same file.
 *
 * @since 1.0.0
 */
public class ArtifactGenerationDebouncer {

    // Default delay in milliseconds
    private static final long DEFAULT_DELAY = 500;
    // Time unit for the delay
    private static final TimeUnit TIME_UNIT = TimeUnit.MILLISECONDS;

    // Map to hold scheduled tasks
    private final ConcurrentHashMap<String, ScheduledTaskHolder> delayedMap;

    // When each key last scheduled a task, to tell a single change from a burst
    private final ConcurrentHashMap<String, Long> lastScheduledAt = new ConcurrentHashMap<>();

    // Map to track project to file relationships
    private final ConcurrentHashMap<String, List<String>> projectFileMap;

    // Map to track queued file tasks waiting for project completion
    private final ConcurrentHashMap<String, List<QueuedTask>> queuedFileTasks;

    // Single-thread scheduler to debounce tasks.
    private final ScheduledExecutorService scheduler;

    private ArtifactGenerationDebouncer() {
        scheduler = Executors.newSingleThreadScheduledExecutor();
        delayedMap = new ConcurrentHashMap<>();
        projectFileMap = new ConcurrentHashMap<>();
        queuedFileTasks = new ConcurrentHashMap<>();
    }

    /**
     * Debounce the given artifact generation task by scheduling it to execute after the default delay. Any previously
     * scheduled task with the same key is cancelled.
     *
     * @param key  The key to identify the task (usually a file name)
     * @param task The task to execute
     */
    public void debounce(String key, Runnable task) {
        debounce(key, task, DEFAULT_DELAY);
    }

    /**
     * Debounce the given artifact generation task by scheduling it to execute after the provided delay. Any previously
     * scheduled task with the same key is cancelled.
     *
     * @param key   The key to identify the task (usually a file name)
     * @param task  The task to execute
     * @param delay The delay in milliseconds
     */
    public void debounce(String key, Runnable task, long delay) {
        CompletableFuture<Void> promise = new CompletableFuture<>();
        // Leading edge: a change after a quiet period publishes at once; only a burst waits for the delay.
        long now = System.currentTimeMillis();
        Long lastScheduled = lastScheduledAt.put(key, now);
        long effectiveDelay = !delayedMap.containsKey(key) && (lastScheduled == null || now - lastScheduled >= delay)
                ? 0 : delay;

        // Schedule the task to run after the specified delay.
        Future<?> scheduledFuture = scheduler.schedule(() -> {
            try {
                task.run();
                promise.complete(null);
            } catch (Exception ex) {
                promise.completeExceptionally(ex);
            } finally {
                delayedMap.remove(key);
                executeQueuedTasks(key);
            }
        }, effectiveDelay, TIME_UNIT);

        // Replace any existing scheduled task with the new one.
        ScheduledTaskHolder prev = delayedMap.put(key, new ScheduledTaskHolder(promise, scheduledFuture));
        if (prev != null) {
            prev.future.cancel(true);
            prev.promise.completeExceptionally(new CancellationException("Debounced by a new request"));
        }
    }

    /**
     * Debounce project-level task and cancel all related file tasks.
     *
     * @param projectKey The project key
     * @param task       The project task to execute
     */
    public void debounceProject(String projectKey, Runnable task) {
        cancelProjectFiles(projectKey);
        debounce(projectKey, task);
    }

    /**
     * Debounce file-level task. If project task is active, queue the file task.
     *
     * @param fileKey    The file key
     * @param projectKey The project key this file belongs to
     * @param task       The file task to execute
     */
    public void debounceFile(String fileKey, String projectKey, Runnable task) {
        // Track the file-project relationship
        projectFileMap.computeIfAbsent(projectKey, k -> new ArrayList<>()).add(fileKey);

        // If project task is active, queue the file task
        if (isProjectTaskActive(projectKey)) {
            queuedFileTasks.computeIfAbsent(projectKey, k -> new ArrayList<>())
                    .add(new QueuedTask(fileKey, task));
            return;
        }

        // Otherwise, proceed with normal debouncing
        debounce(fileKey, task);
    }

    /**
     * Cancel all file-level tasks for a project.
     *
     * @param projectKey The project key
     */
    private void cancelProjectFiles(String projectKey) {
        List<String> fileKeys = projectFileMap.get(projectKey);
        if (fileKeys != null) {
            for (String fileKey : fileKeys) {
                ScheduledTaskHolder taskHolder = delayedMap.remove(fileKey);
                if (taskHolder != null) {
                    taskHolder.future.cancel(true);
                    taskHolder.promise.completeExceptionally(
                            new CancellationException("Cancelled by project reload"));
                }
            }
            projectFileMap.remove(projectKey);
        }

        // Clear any queued tasks for this project
        queuedFileTasks.remove(projectKey);
    }

    /**
     * Check if a project-level task is currently active.
     *
     * @param projectKey The project key
     * @return true if project task is active
     */
    private boolean isProjectTaskActive(String projectKey) {
        return delayedMap.containsKey(projectKey);
    }

    /**
     * Execute queued file tasks when project task completes.
     *
     * @param completedKey The key of the completed task
     */
    private void executeQueuedTasks(String completedKey) {
        List<QueuedTask> queued = queuedFileTasks.remove(completedKey);
        if (queued != null) {
            for (QueuedTask queuedTask : queued) {
                debounce(queuedTask.fileKey, queuedTask.task);
            }
        }
    }

    public static ArtifactGenerationDebouncer getInstance() {
        return Holder.INSTANCE;
    }

    private static class Holder {

        private static final ArtifactGenerationDebouncer INSTANCE = new ArtifactGenerationDebouncer();
    }

    private record ScheduledTaskHolder(CompletableFuture<Void> promise, Future<?> future) {
    }

    private record QueuedTask(String fileKey, Runnable task) {
    }
}
