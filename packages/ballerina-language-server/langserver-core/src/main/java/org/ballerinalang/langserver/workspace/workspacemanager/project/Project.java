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

package org.ballerinalang.langserver.workspace.workspacemanager.project;

import org.ballerinalang.langserver.workspace.workspacemanager.uri.DocumentUri;

import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.locks.ReentrantLock;

import javax.annotation.Nonnull;

/**
 * Aggregate root representing a single Ballerina project in the workspace.
 * Tracks the project's kind, health state, and active/background tier.
 *
 * <p>Health state transitions are governed by the FSM defined in ADR-014 and ADR-033.
 * Kind transitions are restricted per ADR-024.</p>
 *
 * <p>All state mutations (health transitions, kind transitions, source-change notification)
 * are serialised through a single {@code fsmLock}, preventing races between concurrent
 * health and kind mutations.</p>
 *
 * @since 1.7.0
 */
public final class Project {
    private final DocumentUri sourceRoot;
    private final AtomicReference<ProjectKind> kind;
    private final AtomicReference<HealthState> healthState;
    private final OpenDocumentCount openDocumentCount;
    private final ReentrantLock fsmLock = new ReentrantLock();
    /**
     * Internal immutable snapshot of health state, bundling the FSM state and the
     * guard flag used to protect the COMPILATION_CRASHED → RECOVERING arc (ADR-033).
     *
     * @param state current project health state
     * @param sourceChangedSinceLastCrash whether source changed after the last crash
     */
    private record HealthState(ProjectHealthState state, boolean sourceChangedSinceLastCrash) {
    }

    // -------------------------------------------------------------------------
    // Event records — pure domain data; no event-bus imports (ADR-037)
    // -------------------------------------------------------------------------

    /**
     * Event emitted after a health-state transition.
     * Actual publishing is deferred to T-009.
     *
     * @param eventId unique event identifier
     * @param timestamp event occurrence time
     * @param sourceRoot project source root
     * @param eventType event type name
     * @param fromState previous health state
     * @param toState next health state
     */
    public record HealthTransitionEvent(
            UUID eventId,
            Instant timestamp,
            DocumentUri sourceRoot,
            String eventType,
            ProjectHealthState fromState,
            ProjectHealthState toState) {
    }

    /**
     * Event emitted after a kind transition.
     * Actual publishing is deferred to T-009.
     *
     * @param eventId unique event identifier
     * @param timestamp event occurrence time
     * @param sourceRoot project source root
     * @param eventType event type name
     * @param fromKind previous project kind
     * @param toKind next project kind
     */
    public record KindTransitionEvent(
            UUID eventId,
            Instant timestamp,
            DocumentUri sourceRoot,
            String eventType,
            ProjectKind fromKind,
            ProjectKind toKind) {
    }

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    /**
     * Creates a new project in {@link ProjectHealthState#HEALTHY} state.
     *
     * @param sourceRoot    the project source root URI
     * @param kind          initial project kind
     * @throws NullPointerException if any argument is null
     */
    public Project(@Nonnull DocumentUri sourceRoot, @Nonnull ProjectKind kind) {
        this.sourceRoot = sourceRoot;
        this.kind = new AtomicReference<>(kind);
        this.healthState = new AtomicReference<>(new HealthState(ProjectHealthState.HEALTHY, false));
        this.openDocumentCount = new OpenDocumentCount();
    }

    // -------------------------------------------------------------------------
    // FSM — health transitions
    // -------------------------------------------------------------------------

    /**
     * Transitions the project health state to {@code target}, validates the arc,
     * and returns a structured event payload.
     *
     * <p>Acquires {@code fsmLock} for the duration of validation + mutation.
     * Resets {@code sourceChangedSinceLastCrash} to {@code false} when entering
     * {@link ProjectHealthState#RECOVERING}.</p>
     *
     * @param target desired next health state
     * @return event payload describing the transition
     * @throws IllegalStateException if the transition is not valid from the current state
     */
    public HealthTransitionEvent transitionTo(@Nonnull ProjectHealthState target) {
        fsmLock.lock();
        try {
            HealthState current = healthState.get();
            ProjectHealthState from = current.state();
            boolean flag = current.sourceChangedSinceLastCrash();

            if (!isValidHealthTransition(from, target, flag)) {
                throw new IllegalStateException(
                        "Invalid health transition: " + from + " → " + target
                        + (from == ProjectHealthState.COMPILATION_CRASHED
                                ? " (sourceChangedSinceLastCrash=" + flag + ")" : ""));
            }

            boolean newFlag = (target == ProjectHealthState.RECOVERING) ? false : flag;
            healthState.set(new HealthState(target, newFlag));

            return new HealthTransitionEvent(
                    UUID.randomUUID(),
                    Instant.now(),
                    sourceRoot,
                    "health-state-changed",
                    from,
                    target);
        } finally {
            fsmLock.unlock();
        }
    }

    /**
     * Signals that the source has changed, enabling the
     * {@link ProjectHealthState#COMPILATION_CRASHED} → {@link ProjectHealthState#RECOVERING} arc
     * (ADR-033: programmatic recovery without a source change is prohibited).
     */
    public void notifySourceChanged() {
        fsmLock.lock();
        try {
            HealthState current = healthState.get();
            healthState.set(new HealthState(current.state(), true));
        } finally {
            fsmLock.unlock();
        }
    }

    // -------------------------------------------------------------------------
    // Kind transition
    // -------------------------------------------------------------------------

    /**
     * Transitions the project kind to {@code target}.
     * Only {@code SINGLE_FILE ↔ BUILD} is allowed (ADR-024).
     *
     * @param target desired project kind
     * @return event payload describing the kind transition
     * @throws IllegalStateException if the kind transition is not allowed
     */
    public KindTransitionEvent transitionKind(@Nonnull ProjectKind target) {
        fsmLock.lock();
        try {
            ProjectKind from = kind.get();
            if (!isValidKindTransition(from, target)) {
                throw new IllegalStateException(
                        "Invalid kind transition: " + from + " → " + target
                        + " (only SINGLE_FILE ↔ BUILD is allowed)");
            }
            kind.set(target);
            return new KindTransitionEvent(
                    UUID.randomUUID(),
                    Instant.now(),
                    sourceRoot,
                    "kind-transitioned",
                    from,
                    target);
        } finally {
            fsmLock.unlock();
        }
    }

    // -------------------------------------------------------------------------
    // Accessors
    // -------------------------------------------------------------------------

    /**
     * Returns the project identity.
     *
     * @return source root URI
     */
    public DocumentUri sourceRoot() {
        return sourceRoot;
    }

    /**
     * Returns the current project kind.
     *
     * @return project kind
     */
    public ProjectKind kind() {
        return kind.get();
    }

    /**
     * Returns the current health state.
     *
     * @return health state
     */
    public ProjectHealthState healthState() {
        return healthState.get().state();
    }

    /**
     * Returns the open-document count tracker.
     *
     * @return open-document count
     */
    public OpenDocumentCount openDocumentCount() {
        return openDocumentCount;
    }

    // -------------------------------------------------------------------------
    // equals / hashCode / toString
    // -------------------------------------------------------------------------

    @Override
    public boolean equals(Object obj) {
        if (this == obj) {
            return true;
        }
        if (!(obj instanceof Project other)) {
            return false;
        }
        return sourceRoot.equals(other.sourceRoot);
    }

    @Override
    public int hashCode() {
        return sourceRoot.hashCode();
    }

    @Override
    public String toString() {
        return "Project[sourceRoot=" + sourceRoot
                + ", kind=" + kind.get()
                + ", health=" + healthState.get().state() + "]";
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    /**
     * Validates a health-state transition against the FSM table (ADR-014, ADR-033).
     * Self-transitions are always invalid.
     *
     * @param from   current state
     * @param to     desired state
     * @param sourceChangedFlag current value of sourceChangedSinceLastCrash
     * @return {@code true} if the arc is valid
     */
    private boolean isValidHealthTransition(ProjectHealthState from,
                                             ProjectHealthState to,
                                             boolean sourceChangedFlag) {
        if (from == to) {
            return false;
        }
        if (from == ProjectHealthState.PROJECT_CRASHED || from == ProjectHealthState.CANCELLED) {
            return to == ProjectHealthState.RECOVERING;
        }
        return switch (from) {
            case HEALTHY -> to == ProjectHealthState.COMPILATION_CRASHED
                    || to == ProjectHealthState.PROJECT_CRASHED
                    || to == ProjectHealthState.CANCELLED;
            case COMPILATION_CRASHED -> to == ProjectHealthState.RECOVERING && sourceChangedFlag;
            case PROJECT_CRASHED, CANCELLED -> false;
            case RECOVERING -> to == ProjectHealthState.HEALTHY
                    || to == ProjectHealthState.CIRCUIT_OPEN;
            case CIRCUIT_OPEN -> to == ProjectHealthState.RECOVERING;
        };
    }

    /**
     * Validates a kind transition against ADR-024.
     * Only {@code SINGLE_FILE ↔ BUILD} is allowed; self-transitions are rejected.
     *
     * @param from current kind
     * @param to   desired kind
     * @return {@code true} if the transition is allowed
     */
    private boolean isValidKindTransition(ProjectKind from, ProjectKind to) {
        if (from == to) {
            return false;
        }
        return (from == ProjectKind.SINGLE_FILE && to == ProjectKind.BUILD)
                || (from == ProjectKind.BUILD && to == ProjectKind.SINGLE_FILE);
    }
}
