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

import java.util.concurrent.atomic.AtomicInteger;

/**
 * Tracks the number of documents currently open in the editor for a project.
 * Determines the project's {@link ProjectTier}: {@code ACTIVE} when count {@code > 0},
 * {@code BACKGROUND} when count is {@code 0}.
 *
 * @since 1.7.0
 */
public final class OpenDocumentCount {

    private final AtomicInteger count = new AtomicInteger(0);

    /**
     * Increments the open-document count by one.
     */
    public void increment() {
        count.incrementAndGet();
    }

    /**
     * Decrements the open-document count by one, floored at zero.
     * This operation is CAS-based and never produces a negative count.
     */
    public void decrement() {
        int previous;
        do {
            previous = count.get();
            if (previous == 0) {
                return;
            }
        } while (!count.compareAndSet(previous, previous - 1));
    }

    /**
     * Returns the current open-document count.
     *
     * @return current count, always {@code >= 0}
     */
    public int count() {
        return count.get();
    }

    /**
     * Returns the tier based on whether any documents are open.
     *
     * @return {@link ProjectTier#ACTIVE} if count {@code > 0}, {@link ProjectTier#BACKGROUND} otherwise
     */
    public ProjectTier tier() {
        return count.get() > 0 ? ProjectTier.ACTIVE : ProjectTier.BACKGROUND;
    }
}
