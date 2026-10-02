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

package org.ballerinalang.langserver.workspace.resourcemonitor;

import org.testng.Assert;
import org.testng.annotations.Test;


/**
 * Tests for HeapPressureLevel enum.
 *
 * @since 1.7.0
 */
public class HeapPressureLevelTest {

    @Test
    public void enum_hasFourValues() {
        HeapPressureLevel[] levels = HeapPressureLevel.values();
        Assert.assertEquals(levels.length, 4, "HeapPressureLevel should have exactly 4 values");
    }

    @Test
    public void enum_containsExpectedValues() {
        HeapPressureLevel[] expected = {
                HeapPressureLevel.NORMAL,
                HeapPressureLevel.WARNING,
                HeapPressureLevel.CRITICAL,
                HeapPressureLevel.EMERGENCY
        };
        Assert.assertEquals(HeapPressureLevel.values(), expected);
    }

    @Test
    public void normal_hasZeroThreshold() {
        Assert.assertEquals(HeapPressureLevel.NORMAL.threshold(), 0.0,
                "NORMAL threshold should be 0.0");
    }

    @Test
    public void warning_has70PercentThreshold() {
        Assert.assertEquals(HeapPressureLevel.WARNING.threshold(), 0.70,
                "WARNING threshold should be 0.70 (70%)");
    }

    @Test
    public void critical_has80PercentThreshold() {
        Assert.assertEquals(HeapPressureLevel.CRITICAL.threshold(), 0.80,
                "CRITICAL threshold should be 0.80 (80%)");
    }

    @Test
    public void emergency_has90PercentThreshold() {
        Assert.assertEquals(HeapPressureLevel.EMERGENCY.threshold(), 0.90,
                "EMERGENCY threshold should be 0.90 (90%)");
    }

    @Test
    public void thresholdOrdering_normalLessThanWarning() {
        Assert.assertTrue(HeapPressureLevel.NORMAL.threshold() < HeapPressureLevel.WARNING.threshold(),
                "NORMAL < WARNING");
    }

    @Test
    public void thresholdOrdering_warningLessThanCritical() {
        Assert.assertTrue(HeapPressureLevel.WARNING.threshold() < HeapPressureLevel.CRITICAL.threshold(),
                "WARNING < CRITICAL");
    }

    @Test
    public void thresholdOrdering_criticalLessThanEmergency() {
        Assert.assertTrue(HeapPressureLevel.CRITICAL.threshold() < HeapPressureLevel.EMERGENCY.threshold(),
                "CRITICAL < EMERGENCY");
    }

    @Test
    public void valueOf_returnsCorrectLevel() {
        Assert.assertEquals(HeapPressureLevel.valueOf("NORMAL"), HeapPressureLevel.NORMAL);
        Assert.assertEquals(HeapPressureLevel.valueOf("WARNING"), HeapPressureLevel.WARNING);
        Assert.assertEquals(HeapPressureLevel.valueOf("CRITICAL"), HeapPressureLevel.CRITICAL);
        Assert.assertEquals(HeapPressureLevel.valueOf("EMERGENCY"), HeapPressureLevel.EMERGENCY);
    }

    @Test
    public void ordinalValues_areInOrder() {
        Assert.assertEquals(HeapPressureLevel.NORMAL.ordinal(), 0);
        Assert.assertEquals(HeapPressureLevel.WARNING.ordinal(), 1);
        Assert.assertEquals(HeapPressureLevel.CRITICAL.ordinal(), 2);
        Assert.assertEquals(HeapPressureLevel.EMERGENCY.ordinal(), 3);
    }
}
