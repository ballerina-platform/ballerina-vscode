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

package org.ballerinalang.langserver.launchers.stdio;

import org.testng.Assert;
import org.testng.annotations.Test;

import java.time.Duration;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Tests for {@link Quiescence}: the wait the launcher performs between losing its client and ending the
 * process, so in-flight work is not cut off mid-way.
 *
 * @since 1.7.3
 */
public class QuiescenceTest {

    @Test(description = "An idle JVM is left running for the grace period, then ended as soon as it stays idle")
    public void testIdleJvmEndsAfterTheGracePeriod() {
        Duration grace = Duration.ofMillis(1200);
        long start = System.nanoTime();

        boolean idle = Quiescence.awaitIdle(grace, Duration.ofSeconds(10), () -> 0L);

        Duration waited = Duration.ofNanos(System.nanoTime() - start);
        Assert.assertTrue(idle, "a JVM that uses no CPU must be reported idle");
        Assert.assertTrue(waited.compareTo(grace) >= 0,
                "the wait must last at least the grace period, but lasted " + waited.toMillis() + " ms");
        Assert.assertTrue(waited.compareTo(Duration.ofSeconds(5)) < 0,
                "an idle JVM must not be held much longer than the grace period, but was held "
                        + waited.toMillis() + " ms");
    }

    @Test(description = "A JVM that never goes idle is ended when the bound runs out")
    public void testBusyJvmEndsAtTheBound() {
        Duration bound = Duration.ofMillis(1500);
        // Every reading shows far more CPU than the idle allowance for one window.
        AtomicLong cpu = new AtomicLong();
        long start = System.nanoTime();

        boolean idle = Quiescence.awaitIdle(Duration.ZERO, bound,
                () -> cpu.addAndGet(Quiescence.IDLE_CPU_PER_WINDOW.toNanos() * 10));

        Duration waited = Duration.ofNanos(System.nanoTime() - start);
        Assert.assertFalse(idle, "a JVM that keeps consuming CPU must be reported as not idle");
        Assert.assertTrue(waited.compareTo(bound) >= 0,
                "the wait must last until the bound, but lasted " + waited.toMillis() + " ms");
        Assert.assertTrue(waited.compareTo(bound.plusSeconds(2)) < 0,
                "the wait must end soon after the bound, but lasted " + waited.toMillis() + " ms");
    }

    @Test(description = "Work in flight when the client went away is allowed to finish before the JVM is ended")
    public void testInFlightWorkFinishesBeforeTheJvmEnds() throws InterruptedException {
        AtomicBoolean done = new AtomicBoolean();
        Thread worker = new Thread(() -> {
            // Burn CPU for a while, the way a compilation cut off by an instant exit would.
            long until = System.nanoTime() + Duration.ofMillis(1500).toNanos();
            long sink = 0;
            while (System.nanoTime() < until) {
                sink += System.nanoTime() % 7;
            }
            done.set(sink != Long.MIN_VALUE);
        }, "in-flight-work");
        worker.start();

        boolean idle = Quiescence.awaitIdle(Duration.ZERO, Duration.ofSeconds(15), Quiescence.cpuClock());

        Assert.assertTrue(idle, "the JVM must be reported idle once the work has finished");
        Assert.assertTrue(done.get(), "the exit wait must not return before the in-flight work completed");
        worker.join(1000);
    }

    @Test(description = "The real CPU clock measures the other threads, so a sleeping caller reads as idle")
    public void testCpuClockReadsOtherThreads() {
        Quiescence.CpuClock clock = Quiescence.cpuClock();
        long first = clock.read();
        long second = clock.read();
        Assert.assertTrue(second >= first, "CPU time must be monotonic");
    }
}
