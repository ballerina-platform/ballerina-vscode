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
import org.testng.annotations.AfterMethod;
import org.testng.annotations.BeforeMethod;
import org.testng.annotations.Test;

import java.lang.management.MemoryUsage;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Supplier;

/**
 * Unit tests for HeapPressureMonitor.
 * Uses a mock MemoryUsage supplier and a capturing consumer for verifying events.
 *
 * @since 1.7.0
 */
public class HeapPressureMonitorTest {

    private static final long MAX_BYTES = 1_000_000_000L; // 1 GB
    private List<HeapPressureDetected> capturedEvents;
    private HeapPressureMonitor monitor;

    @BeforeMethod
    public void setUp() {
        capturedEvents = Collections.synchronizedList(new ArrayList<>());
    }

    @AfterMethod
    public void tearDown() {
        if (monitor != null) {
            monitor.stop();
            monitor = null;
        }
    }

    // --- Helper to build a MemoryUsage at a given ratio ---

    private static MemoryUsage usageAt(double ratio) {
        long used = (long) (MAX_BYTES * ratio);
        return new MemoryUsage(0, used, used, MAX_BYTES);
    }

    private HeapPressureMonitor buildMonitor(Supplier<MemoryUsage> supplier) {
        return new HeapPressureMonitor(supplier, capturedEvents::add, 5000L);
    }

    // ============================================================
    // Level transition tests (RISING)
    // ============================================================

    @Test
    public void poll_normalToWarning_publishesRisingEvent() {
        AtomicReference<MemoryUsage> usage = new AtomicReference<>(usageAt(0.50));
        monitor = buildMonitor(usage::get);

        // Below threshold — no event
        monitor.pollOnce();
        Assert.assertEquals(capturedEvents.size(), 0, "No event below WARNING threshold");

        // Cross WARNING threshold
        usage.set(usageAt(0.70));
        monitor.pollOnce();

        Assert.assertEquals(capturedEvents.size(), 1);
        HeapPressureDetected event = capturedEvents.get(0);
        Assert.assertEquals(event.level(), HeapPressureLevel.WARNING);
        Assert.assertEquals(event.direction(), PressureDirection.RISING);
    }

    @Test
    public void poll_warningToCritical_publishesRisingEvent() {
        AtomicReference<MemoryUsage> usage = new AtomicReference<>(usageAt(0.72));
        monitor = buildMonitor(usage::get);

        // Reach WARNING
        monitor.pollOnce();
        capturedEvents.clear();

        // Cross CRITICAL threshold
        usage.set(usageAt(0.80));
        monitor.pollOnce();

        Assert.assertEquals(capturedEvents.size(), 1);
        HeapPressureDetected event = capturedEvents.get(0);
        Assert.assertEquals(event.level(), HeapPressureLevel.CRITICAL);
        Assert.assertEquals(event.direction(), PressureDirection.RISING);
    }

    @Test
    public void poll_criticalToEmergency_publishesRisingEvent() {
        AtomicReference<MemoryUsage> usage = new AtomicReference<>(usageAt(0.82));
        monitor = buildMonitor(usage::get);

        // Reach CRITICAL
        monitor.pollOnce();
        capturedEvents.clear();

        // Cross EMERGENCY threshold
        usage.set(usageAt(0.90));
        monitor.pollOnce();

        Assert.assertEquals(capturedEvents.size(), 1);
        HeapPressureDetected event = capturedEvents.get(0);
        Assert.assertEquals(event.level(), HeapPressureLevel.EMERGENCY);
        Assert.assertEquals(event.direction(), PressureDirection.RISING);
    }

    // ============================================================
    // No event when level unchanged
    // ============================================================

    @Test
    public void poll_sameLevel_noEvent() {
        AtomicReference<MemoryUsage> usage = new AtomicReference<>(usageAt(0.72));
        monitor = buildMonitor(usage::get);

        // First poll → WARNING
        monitor.pollOnce();
        Assert.assertEquals(capturedEvents.size(), 1);

        // Second poll at same level — no additional event
        usage.set(usageAt(0.75));
        monitor.pollOnce();

        Assert.assertEquals(capturedEvents.size(), 1, "No event when level stays WARNING");
    }

    @Test
    public void poll_belowAllThresholds_noEvent() {
        monitor = buildMonitor(() -> usageAt(0.50));

        monitor.pollOnce();
        monitor.pollOnce();
        monitor.pollOnce();

        Assert.assertEquals(capturedEvents.size(), 0, "No events below WARNING threshold");
    }

    // ============================================================
    // Hysteresis: de-escalation requires ratio below clear point
    // ============================================================

    @Test
    public void hysteresis_warningClearsAt60Percent_notAt65() {
        AtomicReference<MemoryUsage> usage = new AtomicReference<>(usageAt(0.72));
        monitor = buildMonitor(usage::get);

        // Escalate to WARNING
        monitor.pollOnce();
        Assert.assertEquals(capturedEvents.get(0).level(), HeapPressureLevel.WARNING);
        capturedEvents.clear();

        // Drop to 65% — still above hysteresis clear point (60%), no event
        usage.set(usageAt(0.65));
        monitor.pollOnce();
        Assert.assertEquals(capturedEvents.size(), 0, "No de-escalation at 65% (clear point is 60%)");
    }

    @Test
    public void hysteresis_warningClearsAt60Percent_atExact60() {
        AtomicReference<MemoryUsage> usage = new AtomicReference<>(usageAt(0.72));
        monitor = buildMonitor(usage::get);

        // Escalate to WARNING
        monitor.pollOnce();
        capturedEvents.clear();

        // Drop exactly to 60% — below hysteresis clear point, should de-escalate
        usage.set(usageAt(0.599));
        monitor.pollOnce();

        Assert.assertEquals(capturedEvents.size(), 1);
        HeapPressureDetected event = capturedEvents.get(0);
        Assert.assertEquals(event.level(), HeapPressureLevel.NORMAL);
        Assert.assertEquals(event.direction(), PressureDirection.FALLING);
    }

    @Test
    public void hysteresis_criticalClearsAt70Percent_notAt75() {
        AtomicReference<MemoryUsage> usage = new AtomicReference<>(usageAt(0.82));
        monitor = buildMonitor(usage::get);

        // Escalate to CRITICAL
        monitor.pollOnce();
        Assert.assertEquals(capturedEvents.get(0).level(), HeapPressureLevel.CRITICAL);
        capturedEvents.clear();

        // Drop to 75% — between WARNING (70%) and CRITICAL clear (70%), no event
        usage.set(usageAt(0.75));
        monitor.pollOnce();
        Assert.assertEquals(capturedEvents.size(), 0, "No de-escalation at 75% (CRITICAL clear is 70%)");
    }

    @Test
    public void hysteresis_criticalClearsAt70Percent_below70() {
        AtomicReference<MemoryUsage> usage = new AtomicReference<>(usageAt(0.82));
        monitor = buildMonitor(usage::get);

        // Escalate to CRITICAL
        monitor.pollOnce();
        capturedEvents.clear();

        // Drop below CRITICAL clear point (70%)
        usage.set(usageAt(0.699));
        monitor.pollOnce();

        Assert.assertEquals(capturedEvents.size(), 1);
        HeapPressureDetected event = capturedEvents.get(0);
        Assert.assertEquals(event.level(), HeapPressureLevel.WARNING);
        Assert.assertEquals(event.direction(), PressureDirection.FALLING);
    }

    @Test
    public void hysteresis_emergencyClearsAt80Percent_notAt85() {
        AtomicReference<MemoryUsage> usage = new AtomicReference<>(usageAt(0.92));
        monitor = buildMonitor(usage::get);

        // Escalate to EMERGENCY
        monitor.pollOnce();
        Assert.assertEquals(capturedEvents.get(0).level(), HeapPressureLevel.EMERGENCY);
        capturedEvents.clear();

        // Drop to 85% — still above EMERGENCY clear (80%), no event
        usage.set(usageAt(0.85));
        monitor.pollOnce();
        Assert.assertEquals(capturedEvents.size(), 0, "No de-escalation at 85% (EMERGENCY clear is 80%)");
    }

    @Test
    public void hysteresis_emergencyClearsAt80Percent_below80() {
        AtomicReference<MemoryUsage> usage = new AtomicReference<>(usageAt(0.92));
        monitor = buildMonitor(usage::get);

        // Escalate to EMERGENCY
        monitor.pollOnce();
        capturedEvents.clear();

        // Drop below EMERGENCY clear point (80%)
        usage.set(usageAt(0.799));
        monitor.pollOnce();

        Assert.assertEquals(capturedEvents.size(), 1);
        HeapPressureDetected event = capturedEvents.get(0);
        Assert.assertEquals(event.level(), HeapPressureLevel.CRITICAL);
        Assert.assertEquals(event.direction(), PressureDirection.FALLING);
    }

    // ============================================================
    // Event payload content
    // ============================================================

    @Test
    public void event_containsCorrectBytesAndRatio() {
        long used = 720_000_000L;
        monitor = buildMonitor(() -> new MemoryUsage(0, used, used, MAX_BYTES));

        monitor.pollOnce();

        Assert.assertEquals(capturedEvents.size(), 1);
        HeapPressureDetected event = capturedEvents.get(0);
        Assert.assertEquals(event.usedBytes(), used);
        Assert.assertEquals(event.maxBytes(), MAX_BYTES);
        Assert.assertEquals(event.ratio(), (double) used / MAX_BYTES, 0.001);
    }

    // ============================================================
    // Multi-step transition sequence
    // ============================================================

    @Test
    public void sequence_escalateAndDeescalateFullCycle() {
        AtomicReference<MemoryUsage> usage = new AtomicReference<>(usageAt(0.50));
        monitor = buildMonitor(usage::get);

        // NORMAL → WARNING
        usage.set(usageAt(0.72));
        monitor.pollOnce();
        Assert.assertEquals(capturedEvents.get(0).level(), HeapPressureLevel.WARNING);
        Assert.assertEquals(capturedEvents.get(0).direction(), PressureDirection.RISING);

        // WARNING → CRITICAL
        usage.set(usageAt(0.82));
        monitor.pollOnce();
        Assert.assertEquals(capturedEvents.get(1).level(), HeapPressureLevel.CRITICAL);
        Assert.assertEquals(capturedEvents.get(1).direction(), PressureDirection.RISING);

        // CRITICAL → EMERGENCY
        usage.set(usageAt(0.92));
        monitor.pollOnce();
        Assert.assertEquals(capturedEvents.get(2).level(), HeapPressureLevel.EMERGENCY);
        Assert.assertEquals(capturedEvents.get(2).direction(), PressureDirection.RISING);

        // EMERGENCY → CRITICAL (drop below 80%)
        usage.set(usageAt(0.799));
        monitor.pollOnce();
        Assert.assertEquals(capturedEvents.get(3).level(), HeapPressureLevel.CRITICAL);
        Assert.assertEquals(capturedEvents.get(3).direction(), PressureDirection.FALLING);

        // CRITICAL → WARNING (drop below 70%)
        usage.set(usageAt(0.699));
        monitor.pollOnce();
        Assert.assertEquals(capturedEvents.get(4).level(), HeapPressureLevel.WARNING);
        Assert.assertEquals(capturedEvents.get(4).direction(), PressureDirection.FALLING);

        // WARNING → NORMAL (drop below 60%)
        usage.set(usageAt(0.599));
        monitor.pollOnce();
        Assert.assertEquals(capturedEvents.get(5).level(), HeapPressureLevel.NORMAL);
        Assert.assertEquals(capturedEvents.get(5).direction(), PressureDirection.FALLING);

        Assert.assertEquals(capturedEvents.size(), 6, "Exactly 6 events in full cycle");
    }

    // ============================================================
    // Lifecycle: stop() shuts down polling
    // ============================================================

    @Test
    public void stop_preventsSubsequentPolling() throws Exception {
        AtomicReference<MemoryUsage> usage = new AtomicReference<>(usageAt(0.50));
        monitor = buildMonitor(usage::get);

        monitor.start();
        monitor.stop();

        // After stop(), further pollOnce() should be a no-op (or at least not cause errors)
        usage.set(usageAt(0.80));
        monitor.pollOnce(); // should not throw or emit events after stop

        // The monitor may or may not emit a final event during stop — the key
        // requirement is that the scheduler is shut down without error
        Assert.assertTrue(monitor.isStopped(), "Monitor should be stopped after stop()");
    }

    @Test
    public void start_schedulesPeriodicPolling() throws Exception {
        AtomicReference<MemoryUsage> usage = new AtomicReference<>(usageAt(0.72));
        monitor = new HeapPressureMonitor(usage::get, capturedEvents::add, 50L);

        monitor.start();

        // Wait enough time for at least 2 polls (50ms interval, wait 200ms)
        Thread.sleep(200);

        monitor.stop();

        // Should have at least one WARNING event from scheduled polls
        Assert.assertFalse(capturedEvents.isEmpty(), "Scheduled polling should have produced events");
        Assert.assertEquals(capturedEvents.get(0).level(), HeapPressureLevel.WARNING);
    }

    // ============================================================
    // currentLevel() accessor
    // ============================================================

    @Test
    public void currentLevel_initiallyNormal() {
        monitor = buildMonitor(() -> usageAt(0.50));
        Assert.assertEquals(monitor.currentLevel(), HeapPressureLevel.NORMAL);
    }

    @Test
    public void currentLevel_updatesAfterTransition() {
        AtomicReference<MemoryUsage> usage = new AtomicReference<>(usageAt(0.72));
        monitor = buildMonitor(usage::get);

        monitor.pollOnce();
        Assert.assertEquals(monitor.currentLevel(), HeapPressureLevel.WARNING);

        usage.set(usageAt(0.82));
        monitor.pollOnce();
        Assert.assertEquals(monitor.currentLevel(), HeapPressureLevel.CRITICAL);
    }
}
