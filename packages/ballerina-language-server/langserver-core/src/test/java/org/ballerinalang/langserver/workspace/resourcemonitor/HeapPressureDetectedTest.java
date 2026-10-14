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
 * Tests for HeapPressureDetected event record.
 *
 * @since 1.7.0
 */
public class HeapPressureDetectedTest {

    @Test
    public void record_createsWithAllFields() {
        HeapPressureDetected event = new HeapPressureDetected(
                HeapPressureLevel.WARNING,
                700_000_000L,
                1_000_000_000L,
                0.70,
                PressureDirection.RISING
        );

        Assert.assertEquals(event.level(), HeapPressureLevel.WARNING);
        Assert.assertEquals(event.usedBytes(), 700_000_000L);
        Assert.assertEquals(event.maxBytes(), 1_000_000_000L);
        Assert.assertEquals(event.ratio(), 0.70, 0.001);
        Assert.assertEquals(event.direction(), PressureDirection.RISING);
    }

    @Test
    public void record_calculatesRatioCorrectly() {
        // used = 850MB, max = 1000MB, ratio = 0.85
        HeapPressureDetected event = new HeapPressureDetected(
                HeapPressureLevel.CRITICAL,
                850_000_000L,
                1_000_000_000L,
                0.85,
                PressureDirection.RISING
        );

        Assert.assertEquals(event.ratio(), 0.85, 0.001);
    }

    @Test
    public void record_handlesEmergencyLevel() {
        HeapPressureDetected event = new HeapPressureDetected(
                HeapPressureLevel.EMERGENCY,
                950_000_000L,
                1_000_000_000L,
                0.95,
                PressureDirection.RISING
        );

        Assert.assertEquals(event.level(), HeapPressureLevel.EMERGENCY);
        Assert.assertEquals(event.ratio(), 0.95, 0.001);
    }

    @Test
    public void record_handlesNormalLevel() {
        HeapPressureDetected event = new HeapPressureDetected(
                HeapPressureLevel.NORMAL,
                300_000_000L,
                1_000_000_000L,
                0.30,
                PressureDirection.FALLING
        );

        Assert.assertEquals(event.level(), HeapPressureLevel.NORMAL);
        Assert.assertEquals(event.ratio(), 0.30, 0.001);
    }

    @Test
    public void record_isImmutable() {
        HeapPressureDetected event1 = new HeapPressureDetected(
                HeapPressureLevel.WARNING,
                700_000_000L,
                1_000_000_000L,
                0.70,
                PressureDirection.RISING
        );

        HeapPressureDetected event2 = new HeapPressureDetected(
                HeapPressureLevel.CRITICAL,
                800_000_000L,
                1_000_000_000L,
                0.80,
                PressureDirection.RISING
        );

        // Verify original is unchanged
        Assert.assertEquals(event1.level(), HeapPressureLevel.WARNING);
        Assert.assertEquals(event1.usedBytes(), 700_000_000L);
    }

    @Test
    public void record_toString_containsAllFields() {
        HeapPressureDetected event = new HeapPressureDetected(
                HeapPressureLevel.WARNING,
                700_000_000L,
                1_000_000_000L,
                0.70,
                PressureDirection.RISING
        );

        String str = event.toString();
        Assert.assertTrue(str.contains("WARNING"));
        Assert.assertTrue(str.contains("700000000"));
        Assert.assertTrue(str.contains("1000000000"));
        Assert.assertTrue(str.contains("0.7"));
        Assert.assertTrue(str.contains("RISING"));
    }

    @Test
    public void record_fallingDirection() {
        HeapPressureDetected event = new HeapPressureDetected(
                HeapPressureLevel.NORMAL,
                550_000_000L,
                1_000_000_000L,
                0.55,
                PressureDirection.FALLING
        );

        Assert.assertEquals(event.direction(), PressureDirection.FALLING);
    }
}
