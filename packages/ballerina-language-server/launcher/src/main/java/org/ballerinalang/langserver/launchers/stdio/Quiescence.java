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

import java.lang.management.ManagementFactory;
import java.lang.management.ThreadMXBean;
import java.time.Duration;
import java.util.HashMap;
import java.util.Map;

/**
 * Waits for the JVM's worker threads to go idle before the process is ended.
 * <p>
 * When the client is gone the server still has to be ended, but not halted on the spot: a compilation or a
 * cache write that was in flight when stdin closed would be cut off mid-way, and the next server to open the
 * same project pays for it. Give in-flight work a grace period, then end the process once the other threads
 * have stopped consuming CPU, or when the bound runs out.
 * <p>
 * CPU time is a heuristic for "nothing in flight". It sees a compilation or a cache write, which is what the
 * exit was cutting off; it does not see work that mostly waits on the network or the disk, such as a Central
 * pull, since the launcher has no view of the core's executors or resolution state, and the bound is there
 * because no heuristic covers everything.
 *
 * @since 1.7.3
 */
final class Quiescence {

    /** CPU time the other threads may use per {@link #WINDOW} and still count as idle. */
    static final Duration IDLE_CPU_PER_WINDOW = Duration.ofMillis(25);

    /** Sampling window. */
    static final Duration WINDOW = Duration.ofMillis(500);

    /** How many consecutive idle windows end the wait. */
    static final int IDLE_WINDOWS = 2;

    private Quiescence() {
    }

    /**
     * Blocks for at least {@code minGrace}, then until the threads other than the caller have been idle for
     * {@link #IDLE_WINDOWS} consecutive windows, and never longer than {@code max}.
     *
     * @param minGrace the time to wait before idleness is considered at all
     * @param max      the longest this may block, counted from the start
     * @return {@code true} if the JVM went idle, {@code false} if {@code max} ran out first
     */
    static boolean awaitIdle(Duration minGrace, Duration max) {
        return awaitIdle(minGrace, max, cpuClock());
    }

    /**
     * {@link #awaitIdle(Duration, Duration)} with the CPU clock supplied, so the wait can be tested without
     * burning CPU in the test.
     * <p>
     * An interrupt does not cut the wait short: this runs on the way out of the process, right before it ends,
     * so there is nothing else for the interrupt to reach, and a caller that was interrupted (a server run that
     * ended in {@link InterruptedException}) would otherwise skip the wait that protects in-flight work. The
     * interrupt flag is re-asserted on return.
     *
     * @param minGrace the time to wait before idleness is considered at all
     * @param max      the longest this may block, counted from the start
     * @param cpuNanos the total CPU time consumed by the threads that matter
     * @return {@code true} if the JVM went idle, {@code false} if {@code max} ran out first
     */
    static boolean awaitIdle(Duration minGrace, Duration max, CpuClock cpuNanos) {
        long start = System.nanoTime();
        long deadline = start + max.toNanos();
        long graceEnd = start + minGrace.toNanos();
        boolean interrupted = Thread.interrupted();
        try {
            long previous = cpuNanos.read();
            int idleWindows = 0;
            while (true) {
                long windowEnd = Math.min(deadline, System.nanoTime() + WINDOW.toNanos());
                if (!sleepUntil(windowEnd)) {
                    interrupted = true;
                }
                long current = cpuNanos.read();
                boolean idle = current - previous <= IDLE_CPU_PER_WINDOW.toNanos();
                previous = current;
                if (System.nanoTime() >= deadline) {
                    return false;
                }
                if (System.nanoTime() < graceEnd) {
                    continue;
                }
                idleWindows = idle ? idleWindows + 1 : 0;
                if (idleWindows >= IDLE_WINDOWS) {
                    return true;
                }
            }
        } finally {
            if (interrupted) {
                Thread.currentThread().interrupt();
            }
        }
    }

    /**
     * Sleeps until the given {@link System#nanoTime()}, going back to sleep after an interrupt.
     *
     * @param until the time to sleep until
     * @return {@code false} if an interrupt arrived meanwhile
     */
    private static boolean sleepUntil(long until) {
        boolean undisturbed = true;
        for (long left = until - System.nanoTime(); left > 0; left = until - System.nanoTime()) {
            try {
                Thread.sleep(Duration.ofNanos(left));
            } catch (InterruptedException e) {
                undisturbed = false;
            }
        }
        return undisturbed;
    }

    /**
     * The CPU time consumed by the threads other than the caller's, accumulated across readings; zero where the
     * JVM cannot measure it, so the wait then lasts only the grace period.
     * <p>
     * The total is accumulated per thread, not summed over the live threads at each reading: a thread that ended
     * between two readings would otherwise take its whole history off the total, and a window in which a
     * long-running thread exited while another was busy would read as idle.
     *
     * @return a clock over the other threads' CPU time
     */
    static CpuClock cpuClock() {
        ThreadMXBean threads = ManagementFactory.getThreadMXBean();
        if (!threads.isThreadCpuTimeSupported()) {
            return () -> 0L;
        }
        if (!threads.isThreadCpuTimeEnabled()) {
            threads.setThreadCpuTimeEnabled(true);
        }
        long self = Thread.currentThread().threadId();
        return new CpuClock() {
            private final Map<Long, Long> lastSeen = new HashMap<>();
            private long total;

            @Override
            public synchronized long read() {
                Map<Long, Long> seen = new HashMap<>();
                for (long id : threads.getAllThreadIds()) {
                    if (id == self) {
                        continue;
                    }
                    long cpu = threads.getThreadCpuTime(id);
                    if (cpu < 0) {
                        // Ended since the ids were listed; its time up to the previous reading is already counted.
                        continue;
                    }
                    Long before = lastSeen.get(id);
                    total += before == null ? cpu : Math.max(0L, cpu - before);
                    seen.put(id, cpu);
                }
                lastSeen.clear();
                lastSeen.putAll(seen);
                return total;
            }
        };
    }

    /**
     * A monotonic reading of consumed CPU time, in nanoseconds.
     */
    @FunctionalInterface
    interface CpuClock {
        long read();
    }
}
