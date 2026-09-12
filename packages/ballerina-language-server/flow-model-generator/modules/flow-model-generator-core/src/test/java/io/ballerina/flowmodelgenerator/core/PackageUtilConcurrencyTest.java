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

package io.ballerina.flowmodelgenerator.core;

import io.ballerina.modelgenerator.commons.PackageUtil;
import io.ballerina.projects.Package;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.io.PrintWriter;
import java.io.StringWriter;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Concurrency stability guard for {@link PackageUtil}'s per-thread sample-project resolution
 * (wso2/product-integrator#2193).
 *
 * <p>The bug it relates to: a single shared sample {@code BuildProject} resolved through an
 * environment whose {@code EnvironmentPackageCache} is a plain, unsynchronized {@code HashMap};
 * resolving a package writes into it. Concurrent Language Server requests (flow-model, trigger,
 * connector and library-metadata generation all resolve here) mutated that one map from multiple
 * threads and could corrupt it. The fix gives each thread its own sample project (environment,
 * resolver and cache).
 *
 * <p>What this test does: it hammers the resolver-backed entry points from many threads with an
 * aligned start and asserts (a) no thread throws, (b) the run does not hang, and (c) every concurrent
 * result matches a single-threaded baseline. It is environment-independent: it never asserts a
 * particular package is present, only that concurrent resolution is exception-free and deterministic;
 * the bogus coordinates are the one fixed anchor — they must always resolve as absent, which also
 * proves the resolver is actually being exercised.
 *
 * <p><b>Scope and limitation.</b> This is a stability/consistency guard, not a deterministic
 * reproduction of #2193. That underlying defect is a {@code HashMap}-resize data race, which is
 * timing- and load-dependent: a small package set never trips it, and a set large enough to make it
 * likely also makes an ordinary run slow enough to be indistinguishable from a hang. So this test
 * does not by itself prove the race is present or absent — it guards against gross concurrency
 * regressions (exceptions, deadlocks, divergent results) and documents the per-thread contract. The
 * real protection is the design (per-thread isolation) and, ultimately, a compiler-side thread-safe
 * cache.
 *
 * <p>It lives here, rather than in model-generator-commons (where {@code PackageUtil} is defined),
 * because this module's test task provisions a real Ballerina distribution ({@code ballerina.home}),
 * which building the sample-project environment requires.
 *
 * <p>Offline only: every method exercised here resolves with {@code setOffline(true)}, so the test
 * never contacts Ballerina Central.
 */
public class PackageUtilConcurrencyTest {

    private static final int THREADS = 16;
    private static final int ITERATIONS = 25;
    // Generous relative to the expected runtime (tens of seconds): a breach means a genuine hang
    // (e.g. a deadlock from a reintroduced lock, or a corrupted cache spinning), not mere slowness.
    private static final int TIMEOUT_SECONDS = 180;

    private static final String BOGUS_ORG = "zzz.no.org";

    private record Coord(String org, String name) { }

    // A mix of standard-library candidates (present-or-not is decided by the baseline, never asserted)
    // plus clearly bogus coordinates that must always resolve as absent. Kept modest so the run stays
    // fast; a couple of dependency-heavy packages (http, graphql) still load transitive graphs, and
    // the staggered per-thread start below spreads distinct loads across the pool.
    private static final List<Coord> COORDS = List.of(
            new Coord("ballerina", "http"),
            new Coord("ballerina", "graphql"),
            new Coord("ballerina", "io"),
            new Coord("ballerina", "log"),
            new Coord("ballerina", "crypto"),
            new Coord("ballerina", "cache"),
            new Coord(BOGUS_ORG, "zzz-no-module"),
            new Coord(BOGUS_ORG, "another-absent-module"));

    /**
     * The single-threaded truth for one coordinate, captured before the concurrent run.
     *
     * @param cachedVersion   the version returned by {@code cachedVersion}
     * @param unresolved      whether {@code isModuleUnresolved} reports the module as unresolved
     * @param offlinePresent  whether the module resolves through {@code getModulePackageOffline}
     */
    private record Baseline(String cachedVersion, boolean unresolved, boolean offlinePresent) { }

    @Test
    public void testConcurrentSampleResolutionIsStableAndConsistent() throws Exception {
        List<Baseline> baselines = new ArrayList<>(COORDS.size());
        for (Coord coord : COORDS) {
            baselines.add(baselineFor(coord));
        }

        // Sanity: the bogus coordinates must be unresolved, otherwise the test is not actually
        // exercising the resolver and every other assertion would be vacuous.
        for (int i = 0; i < COORDS.size(); i++) {
            if (BOGUS_ORG.equals(COORDS.get(i).org())) {
                Baseline b = baselines.get(i);
                Assert.assertNull(b.cachedVersion(), "Bogus coordinate unexpectedly resolved a version");
                Assert.assertTrue(b.unresolved(), "Bogus coordinate unexpectedly resolved");
                Assert.assertFalse(b.offlinePresent(), "Bogus coordinate unexpectedly present offline");
            }
        }

        List<Throwable> failures = new CopyOnWriteArrayList<>();
        List<String> mismatches = new CopyOnWriteArrayList<>();
        CyclicBarrier startLine = new CyclicBarrier(THREADS);
        ExecutorService pool = Executors.newFixedThreadPool(THREADS);
        AtomicBoolean stop = new AtomicBoolean(false);
        try {
            List<Future<?>> futures = new ArrayList<>(THREADS);
            for (int t = 0; t < THREADS; t++) {
                final int offset = t; // stagger the start coordinate so threads load DISTINCT packages
                futures.add(pool.submit(() -> {
                    try {
                        startLine.await(); // release all threads at once to maximise contention
                        for (int i = 0; i < ITERATIONS && !stop.get(); i++) {
                            // Exercise the load path (getModulePackage*, each of which builds a fresh
                            // lang-lib environment) only on the first pass. Doing it every pass would
                            // allocate thousands of environments and exhaust the test heap without
                            // adding coverage (later passes are memoized path-cache hits anyway).
                            // Concurrent resolver pressure here comes from the coordinates the shared
                            // SAMPLE_RESOLUTION_CACHE cannot serve: the single-threaded baseline warmed
                            // it for offline-present coordinates, but absence is never cached, so the
                            // bogus coordinates re-enter the resolver on every thread at once. The cheap
                            // metadata methods (cachedVersion / isModuleUnresolved, neither memoized) run
                            // every pass to sustain that contention across the whole run.
                            boolean exerciseLoads = i == 0;
                            for (int j = 0; j < COORDS.size(); j++) {
                                int c = (offset + j) % COORDS.size();
                                checkAgainstBaseline(COORDS.get(c), baselines.get(c), mismatches, exerciseLoads);
                            }
                        }
                    } catch (Throwable e) {
                        stop.set(true);
                        failures.add(e);
                    }
                }));
            }
            pool.shutdown();
            // A corrupted HashMap can spin forever; the timeout turns that into a test failure
            // instead of a hung build.
            boolean finished = pool.awaitTermination(TIMEOUT_SECONDS, TimeUnit.SECONDS);
            Assert.assertTrue(finished,
                    "Concurrent resolution did not finish within " + TIMEOUT_SECONDS + "s (possible deadlock or "
                            + "corrupted resolver cache)");
            for (Future<?> f : futures) {
                f.get(); // surface anything the task machinery swallowed
            }
        } finally {
            stop.set(true);
            pool.shutdownNow();
        }

        Assert.assertTrue(failures.isEmpty(),
                "Concurrent sample-project resolution threw " + failures.size() + " exception(s); first:\n"
                        + (failures.isEmpty() ? "none" : stackToString(failures.get(0))));
        Assert.assertTrue(mismatches.isEmpty(),
                "Concurrent results diverged from the single-threaded baseline: " + mismatches);
    }

    private static Baseline baselineFor(Coord coord) {
        String version = PackageUtil.cachedVersion(coord.org(), coord.name());
        // isModuleUnresolved needs a version: probe the resolved one when known, else a placeholder
        // (which, for an absent package, resolves as unresolved).
        String probeVersion = version != null ? version : "1.0.0";
        boolean unresolved = PackageUtil.isModuleUnresolved(coord.org(), coord.name(), probeVersion);
        boolean offlinePresent = PackageUtil.getModulePackageOffline(coord.org(), coord.name()).isPresent();
        return new Baseline(version, unresolved, offlinePresent);
    }

    private static void checkAgainstBaseline(Coord coord, Baseline baseline, List<String> mismatches,
                                             boolean exerciseLoads) {
        String version = PackageUtil.cachedVersion(coord.org(), coord.name());
        if (!Objects.equals(version, baseline.cachedVersion())) {
            mismatches.add("cachedVersion " + coord + ": expected " + baseline.cachedVersion() + " got " + version);
        }

        String probeVersion = baseline.cachedVersion() != null ? baseline.cachedVersion() : "1.0.0";
        boolean unresolved = PackageUtil.isModuleUnresolved(coord.org(), coord.name(), probeVersion);
        if (unresolved != baseline.unresolved()) {
            mismatches.add("isModuleUnresolved " + coord + ": expected " + baseline.unresolved()
                    + " got " + unresolved);
        }

        if (!exerciseLoads) {
            return;
        }

        Optional<Package> offline = PackageUtil.getModulePackageOffline(coord.org(), coord.name());
        if (offline.isPresent() != baseline.offlinePresent()) {
            mismatches.add("getModulePackageOffline " + coord + ": expected present=" + baseline.offlinePresent()
                    + " got present=" + offline.isPresent());
        }

        // Only exercise getModulePackage for coordinates already resolvable offline, so this stays
        // offline (its cache miss would otherwise fall back to Central for an absent package).
        if (baseline.offlinePresent()) {
            Optional<Package> pkg = PackageUtil.getModulePackage(PackageUtil.getSampleProject(),
                    coord.org(), coord.name());
            if (pkg.isEmpty()) {
                mismatches.add("getModulePackage " + coord + ": expected present but was empty");
            }
        }
    }

    private static String stackToString(Throwable t) {
        StringWriter sw = new StringWriter();
        t.printStackTrace(new PrintWriter(sw));
        return sw.toString();
    }
}
