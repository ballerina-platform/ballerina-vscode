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

import org.ballerinalang.langserver.workspace.workspacemanager.LockingMode;

import javax.annotation.Nonnull;

/**
 * Stateless strategy for traversing the dependency locking recovery ladder.
 *
 * @since 1.7.0
 */
public final class RecoveryLadder {
    private RecoveryLadder() {
    }

    /**
     * Computes the next locking mode for the given recovery signal.
     *
     * @param currentMode current locking mode
     * @param failureType recovery signal to apply
     * @return next locking mode after applying the recovery ladder rule
     * @throws NullPointerException if currentMode or failureType is null
     */
    public static LockingMode nextMode(@Nonnull LockingMode currentMode, @Nonnull FailureType failureType) {

        return switch (failureType) {
            case RESOLUTION_FAILED -> escalate(currentMode);
            case RESOLUTION_SUCCEEDED -> deEscalate(currentMode);
            case EXTERNAL_OVERRIDE -> currentMode;
        };
    }

    private static LockingMode escalate(LockingMode currentMode) {
        return switch (currentMode) {
            case SOFT -> LockingMode.MEDIUM;
            case MEDIUM -> LockingMode.HARD;
            case HARD, LOCKED -> LockingMode.LOCKED;
        };
    }

    private static LockingMode deEscalate(LockingMode currentMode) {
        return switch (currentMode) {
            case LOCKED -> LockingMode.HARD;
            case HARD -> LockingMode.MEDIUM;
            case MEDIUM, SOFT -> LockingMode.SOFT;
        };
    }
}
