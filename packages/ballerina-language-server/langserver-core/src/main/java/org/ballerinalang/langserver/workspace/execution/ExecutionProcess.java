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

package org.ballerinalang.langserver.workspace.execution;

import org.ballerinalang.langserver.workspace.executionmanager.ProcessId;
import org.ballerinalang.langserver.workspace.workspacemanager.uri.DocumentUri;

import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.Consumer;

import javax.annotation.Nonnull;

/**
 * Aggregate root representing a single process execution.
 * Manages process lifecycle, FSM state transitions, and structured transition events.
 *
 * <p>Implements the shutdown sequence: TERM (wait grace), then KILL if still alive,
 * per ADR-033.</p>
 *
 * @since 1.7.0
 */
public final class ExecutionProcess {
    private final ProcessId processId;
    private final DocumentUri sourceRoot;
    private final ExecutionMode executionMode;
    private final Path executablePath;
    private final Duration gracePeriod;
    private final Process underlyingProcess;
    private final Consumer<StreamSource> outputConsumer;
    private final Consumer<ExecutionProcess> terminationHook;
    private final Consumer<ExecutionProcess> forcedKillHook;
    private final ReentrantLock fsmLock = new ReentrantLock();
    private final AtomicReference<ProcessState> state;
    private final List<TransitionEvent> transitionEvents = new CopyOnWriteArrayList<>();
    /**
     * Enumeration of process lifecycle states for FSM.
     */
    public enum ProcessState {
        STARTING,
        RUNNING,
        TERMINATING,
        TERMINATED
    }

    /**
     * Enumeration of process execution modes.
     */
    public enum ExecutionMode {
        RUN,
        DEBUG,
        TEST
    }

    /**
     * Enumeration of reasons for process termination.
     */
    public enum TerminationReason {
        USER_REQUESTED,
        EVICTION_CLEANUP,
        PROJECT_KIND_TRANSITIONED,
        COMPILATION_STARTED
    }

    /**
     * Enumeration of output stream sources.
     */
    public enum StreamSource {
        STDOUT,
        STDERR
    }

    /**
     * Event emitted after a state transition.
     *
     * @param eventId unique event identifier
     * @param timestamp event occurrence time
     * @param processId process identifier
     * @param fromState previous process state
     * @param toState next process state
     */
    public record TransitionEvent(
            UUID eventId,
            Instant timestamp,
            ProcessId processId,
            ProcessState fromState,
            ProcessState toState) {
    }

    /**
     * Creates a new process aggregate.
     *
     * @param processId unique process identifier
     * @param sourceRoot project source root URI
     * @param executionMode execution mode
     * @param executablePath path to executable
     * @param gracePeriod termination grace period
     * @param underlyingProcess underlying OS process
     * @param outputConsumer consumer for output stream data
     */
    public ExecutionProcess(ProcessId processId,
                            DocumentUri sourceRoot,
                            ExecutionMode executionMode,
                            Path executablePath,
                            Duration gracePeriod,
                            Process underlyingProcess,
                            Consumer<StreamSource> outputConsumer) {
        this(processId, sourceRoot, executionMode, executablePath, gracePeriod, underlyingProcess,
                outputConsumer, null, null);
    }

    /**
     * Creates a new process aggregate with custom termination hooks for testing.
     *
     * @param processId unique process identifier
     * @param sourceRoot project source root URI
     * @param executionMode execution mode
     * @param executablePath path to executable
     * @param gracePeriod termination grace period
     * @param underlyingProcess underlying OS process
     * @param outputConsumer consumer for output stream data
     * @param terminationHook optional hook called during termination (for testing)
     * @param forcedKillHook optional hook called during forced kill (for testing)
     */
    ExecutionProcess(@Nonnull ProcessId processId,
                     @Nonnull DocumentUri sourceRoot,
                     @Nonnull ExecutionMode executionMode,
                     @Nonnull Path executablePath,
                     @Nonnull Duration gracePeriod,
                     @Nonnull Process underlyingProcess,
                     @Nonnull Consumer<StreamSource> outputConsumer,
                     Consumer<ExecutionProcess> terminationHook,
                     Consumer<ExecutionProcess> forcedKillHook) {
        this.processId = processId;
        this.sourceRoot = sourceRoot;
        this.executionMode = executionMode;
        this.executablePath = executablePath;
        this.gracePeriod = gracePeriod;
        this.underlyingProcess = underlyingProcess;
        this.outputConsumer = outputConsumer;
        this.terminationHook = terminationHook;
        this.forcedKillHook = forcedKillHook;
        this.state = new AtomicReference<>(ProcessState.STARTING);
    }

    /**
     * Marks the process as running. Only valid from STARTING state.
     *
     * @return this process for chaining
     * @throws IllegalStateException if current state is not STARTING
     */
    public ExecutionProcess markRunning() {
        transitionTo(ProcessState.RUNNING);
        return this;
    }

    /**
     * Initiates termination of this process.
     * Implements shutdown sequence: TERM, wait grace, then KILL if needed.
     *
     * @param reason reason for termination
     * @throws IllegalStateException if current state does not allow termination
     */
    public void terminate(@Nonnull TerminationReason reason) {
        fsmLock.lock();
        try {
            ProcessState current = state.get();
            if (current != ProcessState.RUNNING) {
                throw new IllegalStateException(
                        "Cannot terminate from state: " + current + " (expected RUNNING)");
            }

            transitionTo(ProcessState.TERMINATING);

            if (terminationHook != null) {
                terminationHook.accept(this);
            }
            underlyingProcess.destroy();

            boolean exited = underlyingProcess.waitFor(gracePeriod.toMillis(), TimeUnit.MILLISECONDS);

            if (!exited && underlyingProcess.isAlive()) {
                if (forcedKillHook != null) {
                    forcedKillHook.accept(this);
                }
                underlyingProcess.destroyForcibly();
                underlyingProcess.waitFor(gracePeriod.toMillis(), TimeUnit.MILLISECONDS);
            }

            transitionTo(ProcessState.TERMINATED);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            underlyingProcess.destroyForcibly();
            transitionTo(ProcessState.TERMINATED);
        } finally {
            fsmLock.unlock();
        }
    }

    /**
     * Returns the current process state.
     *
     * @return current state
     */
    public ProcessState state() {
        return state.get();
    }

    /**
     * Returns the process identifier.
     *
     * @return process ID
     */
    public ProcessId processId() {
        return processId;
    }

    /**
     * Returns the source root URI.
     *
     * @return source root URI
     */
    public DocumentUri sourceRoot() {
        return sourceRoot;
    }

    /**
     * Returns the execution mode.
     *
     * @return execution mode
     */
    public ExecutionMode executionMode() {
        return executionMode;
    }

    /**
     * Returns the executable path.
     *
     * @return executable path
     */
    public Path executablePath() {
        return executablePath;
    }

    /**
     * Returns the underlying process.
     *
     * @return underlying process
     */
    public Process underlyingProcess() {
        return underlyingProcess;
    }

    /**
     * Returns an immutable list of transition events.
     *
     * @return transition events
     */
    public List<TransitionEvent> transitionEvents() {
        return List.copyOf(transitionEvents);
    }

    /**
     * Consumes output from the given stream source.
     *
     * @param source stream source
     */
    public void consumeOutput(StreamSource source) {
        outputConsumer.accept(source);
    }

    private void transitionTo(ProcessState target) {
        ProcessState from = state.get();
        if (!isValidTransition(from, target)) {
            throw new IllegalStateException("Invalid transition: " + from + " -> " + target);
        }
        state.set(target);
        TransitionEvent event = new TransitionEvent(
                UUID.randomUUID(),
                Instant.now(),
                processId,
                from,
                target);
        transitionEvents.add(event);
    }

    private boolean isValidTransition(ProcessState from, ProcessState to) {
        if (from == to) {
            return false;
        }
        return switch (from) {
            case STARTING -> to == ProcessState.RUNNING || to == ProcessState.TERMINATING;
            case RUNNING -> to == ProcessState.TERMINATING;
            case TERMINATING -> to == ProcessState.TERMINATED;
            case TERMINATED -> false;
        };
    }

    @Override
    public boolean equals(Object obj) {
        if (this == obj) {
            return true;
        }
        if (!(obj instanceof ExecutionProcess other)) {
            return false;
        }
        return processId.equals(other.processId);
    }

    @Override
    public int hashCode() {
        return processId.hashCode();
    }

    @Override
    public String toString() {
        return "ExecutionProcess[id=" + processId + ", state=" + state.get() + "]";
    }
}
