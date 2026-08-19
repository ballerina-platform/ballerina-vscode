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

package org.ballerinalang.langserver.workspace.compilerengine;

import org.ballerinalang.langserver.workspace.compilerengine.recovery.FailureType;
import org.ballerinalang.langserver.workspace.compilerengine.recovery.RecoveryLadder;
import org.ballerinalang.langserver.workspace.workspacemanager.LockingMode;
import org.testng.Assert;
import org.testng.annotations.DataProvider;
import org.testng.annotations.Test;

/**
 * Tests for {@link RecoveryLadder}.
 *
 * @since 1.7.0
 */
public class RecoveryLadderTest {

    @DataProvider(name = "resolutionFailureTransitions")
    public Object[][] resolutionFailureTransitions() {
        return new Object[][]{
                {LockingMode.SOFT, LockingMode.MEDIUM},
                {LockingMode.MEDIUM, LockingMode.HARD},
                {LockingMode.HARD, LockingMode.LOCKED},
                {LockingMode.LOCKED, LockingMode.LOCKED}
        };
    }

    @DataProvider(name = "resolutionSuccessTransitions")
    public Object[][] resolutionSuccessTransitions() {
        return new Object[][]{
                {LockingMode.SOFT, LockingMode.SOFT},
                {LockingMode.MEDIUM, LockingMode.SOFT},
                {LockingMode.HARD, LockingMode.MEDIUM},
                {LockingMode.LOCKED, LockingMode.HARD}
        };
    }

    @DataProvider(name = "externalOverrideTransitions")
    public Object[][] externalOverrideTransitions() {
        return new Object[][]{
                {LockingMode.SOFT},
                {LockingMode.MEDIUM},
                {LockingMode.HARD},
                {LockingMode.LOCKED}
        };
    }

    @Test(dataProvider = "resolutionFailureTransitions")
    public void nextMode_resolutionFailed_escalatesOneStep(LockingMode currentMode, LockingMode expectedMode) {
        // RED: this test should fail - RecoveryLadder not yet implemented
        Assert.assertEquals(RecoveryLadder.nextMode(currentMode, FailureType.RESOLUTION_FAILED), expectedMode);
    }

    @Test(dataProvider = "resolutionSuccessTransitions")
    public void nextMode_resolutionSucceeded_deEscalatesOneStep(LockingMode currentMode, LockingMode expectedMode) {
        Assert.assertEquals(RecoveryLadder.nextMode(currentMode, FailureType.RESOLUTION_SUCCEEDED), expectedMode);
    }

    @Test(dataProvider = "externalOverrideTransitions")
    public void nextMode_externalOverride_preservesCurrentMode(LockingMode currentMode) {
        Assert.assertEquals(RecoveryLadder.nextMode(currentMode, FailureType.EXTERNAL_OVERRIDE), currentMode);
    }
}
