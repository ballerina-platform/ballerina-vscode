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

import java.lang.management.ManagementFactory;
import java.lang.management.MemoryPoolMXBean;
import java.lang.management.MemoryType;
import java.lang.management.MemoryUsage;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Consumer;
import java.util.function.Supplier;

import javax.annotation.Nonnull;

/**
 * Polls old-generation heap usage and publishes graduated {@link HeapPressureDetected} events
 * when pressure level transitions occur (ADR-041).
 *
 * <p>Thresholds (escalation): WARNING ≥ 70%, CRITICAL ≥ 80%, EMERGENCY ≥ 90%.<br>
 * Hysteresis (de-escalation): WARNING clears at &lt; 60%, CRITICAL at &lt; 70%, EMERGENCY at &lt; 80%.
 *
 * <p>Events are only published on transitions — not on every poll.
 *
 * @since 1.7.0
 */
public class HeapPressureMonitor {
    // Escalation thresholds
    private static final double THRESHOLD_WARNING = 0.70;
    private static final double THRESHOLD_CRITICAL = 0.80;
    private static final double THRESHOLD_EMERGENCY = 0.90;

    // De-escalation hysteresis clear points (10% below each threshold)
    private static final double CLEAR_TO_NORMAL = 0.60;   // WARNING clears here
    private static final double CLEAR_TO_WARNING = 0.70;  // CRITICAL clears here
    private static final double CLEAR_TO_CRITICAL = 0.80; // EMERGENCY clears here

    private final Supplier<MemoryUsage> memoryUsageSupplier;
    private final Consumer<HeapPressureDetected> eventPublisher;
    private final long pollIntervalMs;

    private volatile HeapPressureLevel currentLevel = HeapPressureLevel.NORMAL;
    private final AtomicBoolean stopped = new AtomicBoolean(false);
    private ScheduledExecutorService scheduler;

    /**
     * Creates a monitor that auto-detects the old-gen memory pool from
     * {@link ManagementFactory#getMemoryPoolMXBeans()}.
     *
     * @param eventPublisher callback invoked on pressure level transitions
     * @param pollIntervalMs polling interval in milliseconds (default 5000)
     */
    public HeapPressureMonitor(Consumer<HeapPressureDetected> eventPublisher, long pollIntervalMs) {
        this(detectOldGenSupplier(), eventPublisher, pollIntervalMs);
    }

    /**
     * Creates a monitor with an injectable memory usage supplier (for testing).
     *
     * @param memoryUsageSupplier supplies current heap usage on each poll
     * @param eventPublisher      callback invoked on pressure level transitions
     * @param pollIntervalMs      polling interval in milliseconds
     */
    public HeapPressureMonitor(@Nonnull Supplier<MemoryUsage> memoryUsageSupplier,
                               @Nonnull Consumer<HeapPressureDetected> eventPublisher,
                               long pollIntervalMs) {
        this.memoryUsageSupplier = memoryUsageSupplier;
        this.eventPublisher = eventPublisher;
        if (pollIntervalMs <= 0) {
            throw new IllegalArgumentException("pollIntervalMs must be positive");
        }
        this.pollIntervalMs = pollIntervalMs;
    }

    /**
     * Starts periodic polling on a daemon thread.
     * Calling start() on an already-started monitor has no effect.
     */
    public synchronized void start() {
        if (scheduler != null || stopped.get()) {
            return;
        }
        scheduler = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "heap-pressure-monitor");
            t.setDaemon(true);
            return t;
        });
        scheduler.scheduleAtFixedRate(this::pollOnce, pollIntervalMs, pollIntervalMs, TimeUnit.MILLISECONDS);
    }

    /**
     * Stops periodic polling and shuts down the scheduler.
     * Safe to call multiple times.
     */
    public synchronized void stop() {
        stopped.set(true);
        if (scheduler != null) {
            scheduler.shutdownNow();
            scheduler = null;
        }
    }

    /**
     * Returns {@code true} if {@link #stop()} has been called.
     */
    public boolean isStopped() {
        return stopped.get();
    }

    /**
     * Returns the current pressure level (may lag one poll behind the JVM state).
     */
    public HeapPressureLevel currentLevel() {
        return currentLevel;
    }

    /**
     * Performs a single poll: reads memory usage, computes the new level using hysteresis,
     * and publishes a {@link HeapPressureDetected} event if the level has changed.
     *
     * <p>This method is package-visible to allow direct invocation from tests without
     * waiting for the scheduler.
     */
    void pollOnce() {
        if (stopped.get()) {
            return;
        }

        MemoryUsage usage;
        try {
            usage = memoryUsageSupplier.get();
        } catch (RuntimeException e) {
            // Supplier failure — skip this poll
            return;
        }

        long maxBytes = usage.getMax();
        if (maxBytes <= 0) {
            return; // undefined max — cannot compute ratio
        }

        long usedBytes = usage.getUsed();
        double ratio = (double) usedBytes / maxBytes;

        HeapPressureLevel newLevel = computeNewLevel(ratio, currentLevel);
        if (newLevel == currentLevel) {
            return;
        }

        PressureDirection direction = newLevel.ordinal() > currentLevel.ordinal()
                ? PressureDirection.RISING
                : PressureDirection.FALLING;

        currentLevel = newLevel;
        eventPublisher.accept(new HeapPressureDetected(newLevel, usedBytes, maxBytes, ratio, direction));
    }

    /**
     * Computes the next pressure level from the current ratio and current level,
     * applying hysteresis for de-escalation.
     */
    private static HeapPressureLevel computeNewLevel(double ratio, HeapPressureLevel current) {
        // Escalation: apply in descending order so the highest applicable threshold wins
        if (ratio >= THRESHOLD_EMERGENCY) {
            return HeapPressureLevel.EMERGENCY;
        }
        if (ratio >= THRESHOLD_CRITICAL) {
            // Only escalate to CRITICAL; don't artificially de-escalate from EMERGENCY here
            if (current.ordinal() < HeapPressureLevel.CRITICAL.ordinal()) {
                return HeapPressureLevel.CRITICAL;
            }
        }
        if (ratio >= THRESHOLD_WARNING) {
            if (current.ordinal() < HeapPressureLevel.WARNING.ordinal()) {
                return HeapPressureLevel.WARNING;
            }
        }

        // De-escalation with hysteresis
        return switch (current) {
            case EMERGENCY -> ratio < CLEAR_TO_CRITICAL ? HeapPressureLevel.CRITICAL : current;
            case CRITICAL -> ratio < CLEAR_TO_WARNING ? HeapPressureLevel.WARNING : current;
            case WARNING -> ratio < CLEAR_TO_NORMAL ? HeapPressureLevel.NORMAL : current;
            case NORMAL -> current;
        };
    }

    /**
     * Detects the old-generation memory pool from the JVM's MXBean list.
     * Falls back to {@link Runtime} total/max if no old-gen pool is found (e.g. ZGC).
     */
    private static Supplier<MemoryUsage> detectOldGenSupplier() {
        List<MemoryPoolMXBean> pools = ManagementFactory.getMemoryPoolMXBeans();
        for (MemoryPoolMXBean pool : pools) {
            if (pool.getType() == MemoryType.HEAP) {
                String name = pool.getName().toLowerCase(Locale.ROOT);
                if (name.contains("old gen") || name.contains("tenured")) {
                    return pool::getUsage;
                }
            }
        }
        // Fallback: use total heap via Runtime
        return () -> {
            Runtime rt = Runtime.getRuntime();
            long max = rt.maxMemory();
            long used = rt.totalMemory() - rt.freeMemory();
            return new MemoryUsage(0, used, used, max);
        };
    }
}
