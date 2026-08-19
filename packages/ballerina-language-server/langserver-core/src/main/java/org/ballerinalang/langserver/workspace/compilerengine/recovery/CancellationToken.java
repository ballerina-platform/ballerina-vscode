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

package org.ballerinalang.langserver.workspace.compilerengine.recovery;

import java.util.concurrent.CancellationException;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Cooperative cancellation flag for compilation tasks (ADR-018).
 *
 * <p>Thread-safe, one-shot: once cancelled, stays cancelled.
 *
 * @since 1.7.0
 */
public final class CancellationToken {

    private final AtomicBoolean cancelled = new AtomicBoolean(false);

    /**
     * Requests cancellation. Idempotent — subsequent calls are no-ops.
     */
    public void cancel() {
        cancelled.set(true);
    }

    /**
     * Returns whether cancellation has been requested.
     *
     * @return {@code true} if cancelled
     */
    public boolean isCancelled() {
        return cancelled.get();
    }

    /**
     * Phase-boundary checkpoint: throws if cancellation has been requested.
     *
     * @throws CancellationException if cancelled
     */
    public void checkCancelled() {
        if (cancelled.get()) {
            throw new CancellationException("Compilation cancelled");
        }
    }
}
