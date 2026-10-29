/*
 * Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com)
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
package org.ballerinalang.langserver.commons.workspace;

import io.ballerina.projects.Project;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.WeakHashMap;
import java.util.concurrent.locks.Lock;

/**
 * Finds the lock that guards a {@link Project} instance, so code outside the workspace manager can compile it under
 * the same lock the workspace manager uses.
 * <p>
 * Compiling a package is not thread-safe in the compiler: two first-time compilations of the same project add to
 * the project's compiler plugin contexts, an unsynchronized list, at the same time. The workspace manager
 * serializes its own compilations with its per-project lock, so any other code that compiles a project the
 * workspace manager holds has to take that lock too; a lock of its own alone is not enough.
 * <p>
 * The lock is asked of each owner when it is needed rather than recorded when a project is created: a workspace
 * manager creates contexts that never reach its project map, and on a reload replaces the map's contexts while an
 * older context still holds the same project instance, so only the map can say which lock is current. Owners are
 * held weakly.
 */
public final class ProjectLocks {

    private static final Set<Owner> OWNERS = Collections.synchronizedSet(
            Collections.newSetFromMap(new WeakHashMap<>()));

    private ProjectLocks() {
    }

    /**
     * Adds an owner of project locks. It is held weakly, so the caller keeps it reachable for as long as it holds
     * projects.
     *
     * @param owner the owner to ask
     */
    public static void addOwner(Owner owner) {
        OWNERS.add(owner);
    }

    /**
     * Removes an owner added with {@link #addOwner(Owner)}.
     *
     * @param owner the owner to stop asking
     */
    public static void removeOwner(Owner owner) {
        OWNERS.remove(owner);
    }

    /**
     * Returns the lock that guards the given project instance.
     *
     * @param project the project instance
     * @return the lock its owner takes before compiling or modifying it, or empty when no owner holds this instance
     */
    public static Optional<Lock> of(Project project) {
        List<Owner> owners;
        synchronized (OWNERS) {
            owners = new ArrayList<>(OWNERS);
        }
        for (Owner owner : owners) {
            Optional<Lock> lock = owner.lockOf(project);
            if (lock.isPresent()) {
                return lock;
            }
        }
        return Optional.empty();
    }

    /**
     * Holds projects and guards each with a lock.
     */
    @FunctionalInterface
    public interface Owner {

        /**
         * Returns the lock guarding the given project instance, if this owner currently holds it.
         *
         * @param project the project instance
         * @return the lock, or empty when this owner does not hold the instance
         */
        Optional<Lock> lockOf(Project project);
    }
}
