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

package io.ballerina.flowmodelgenerator.core.utils;

import java.util.concurrent.Callable;
import java.util.concurrent.locks.ReentrantLock;

/**
 * Runs the requests that check a form by editing the open documents for a moment: each writes into the workspace's
 * copy of a document (a candidate statement, an expression to check), reads diagnostics from it, and writes back what
 * it found there. The expression editor's checks and a whole node's diagnostics run on threads of their own, so without
 * taking turns one could find another's candidate in the document, report against it (a connection's own candidate
 * declaring its name a second time), or write it back as if it were the document, leaving it there after both are done.
 *
 * @since 1.9.0
 */
public final class WorkspaceProbes {

    private static final ReentrantLock LOCK = new ReentrantLock(true);

    private WorkspaceProbes() {
    }

    /**
     * Runs a probe alone: no other probe edits, reads or restores a document until this one has restored what it
     * changed. The probe must restore the documents it edits before it returns.
     *
     * @param probe edits documents, works out its answer, and restores them
     * @return the probe's answer
     * @throws Exception whatever the probe throws
     */
    public static <T> T exclusively(Callable<T> probe) throws Exception {
        LOCK.lockInterruptibly();
        try {
            return probe.call();
        } finally {
            LOCK.unlock();
        }
    }
}
