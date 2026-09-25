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

package io.ballerina.servicemodelgenerator.extension.connector;

import io.ballerina.projects.Project;
import io.ballerina.projects.directory.BuildProject;
import io.ballerina.servicemodelgenerator.extension.model.ResolvedConnectorVersion;
import io.ballerina.servicemodelgenerator.extension.model.ResolvedConnectorVersion.VersionSource;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.net.URISyntaxException;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Duration;
import java.util.concurrent.CountDownLatch;
import java.util.function.Supplier;

/**
 * Unit test for {@link ConnectorVersionResolver}: the add-service flow must model a connector against
 * the version the project will compile against, not the (typically newest) version the client asked
 * for — otherwise a project locked to an older release gets source referencing types it does not have.
 *
 * <p>Reads the lock file only, so no dependency resolution or network access is involved.
 *
 * @since 1.9.0
 */
public class ConnectorVersionResolverTest {

    private static final Duration CENTRAL_TEST_TIMEOUT = Duration.ofMillis(200);
    private static final long TIMEOUT_TOLERANCE_FACTOR = 10;

    @Test
    public void testLockedVersionWinsOverRequested() throws URISyntaxException {
        Project project = load("connector_version/pinned_mcp");
        Assert.assertEquals(ConnectorVersionResolver.resolve(project, "ballerina", "mcp", "1.2.0"), "1.0.3",
                "Dependencies.toml pins 1.0.3, so the requested 1.2.0 must not win");
    }

    /**
     * The case that matters most in practice: pinned in {@code Ballerina.toml}, never built, so there
     * is no lock file. The pin must win over the requested version <b>and</b> over the dependency
     * graph — the language server resolves offline, so if the pinned bala is not cached the graph
     * silently reports the newest cached release instead.
     */
    @Test
    public void testManifestPinWinsWithoutLockFile() throws URISyntaxException {
        Project project = load("connector_version/manifest_pinned_mcp");
        Assert.assertEquals(ConnectorVersionResolver.resolve(project, "ballerina", "mcp", "1.2.0"), "1.0.3",
                "Ballerina.toml pins 1.0.3 and there is no Dependencies.toml, so 1.0.3 must still win");
    }

    @Test
    public void testRequestedVersionUsedWhenProjectHasNoDependency() throws URISyntaxException {
        Project project = load("connector_version/no_mcp");
        Assert.assertEquals(ConnectorVersionResolver.resolve(project, "ballerina", "mcp", "1.2.0"), "1.2.0",
                "nothing pins the connector, so the version the client requested stands");
    }

    @Test
    public void testUnknownConnectorAndNullProjectDegradeToRequested() throws URISyntaxException {
        Project project = load("connector_version/pinned_mcp");
        Assert.assertEquals(ConnectorVersionResolver.resolve(project, "ballerina", "no-such-pkg", "9.9.9"), "9.9.9");
        Assert.assertNull(ConnectorVersionResolver.resolve(null, "ballerina", "mcp", null),
                "no project and no requested version leaves the caller on the newest schema variant");
    }

    @Test
    public void testProjectVersionIsEmptyWithoutDependency() throws URISyntaxException {
        Assert.assertTrue(ConnectorVersionResolver.projectVersion(load("connector_version/no_mcp"), "ballerina", "mcp")
                .isEmpty());
        Assert.assertEquals(ConnectorVersionResolver.projectVersion(load("connector_version/pinned_mcp"),
                "ballerina", "mcp").orElseThrow(), "1.0.3");
    }

    @Test
    public void testCentralLatestWinsForNewDependency() {
        assertResolved(ConnectorVersionResolver.resolveForNewDependency("1.2.0", () -> "1.5.0", () -> "1.3.0"),
                "1.5.0", VersionSource.CENTRAL_LATEST);
    }

    @Test
    public void testCachedLatestUsedWhenCentralUnreachable() {
        assertResolved(ConnectorVersionResolver.resolveForNewDependency("1.2.0", () -> {
            throw new IllegalStateException("Central unreachable");
        }, () -> "1.3.0"), "1.3.0", VersionSource.LOCAL_CACHE_LATEST);
        assertResolved(ConnectorVersionResolver.resolveForNewDependency("1.2.0", () -> null, () -> "1.2.0"),
                "1.2.0", VersionSource.LOCAL_CACHE_LATEST);
    }

    @Test
    public void testCentralTimeoutFallsBackToCachedLatest() {
        assertFallbackOnCentralTimeout(() -> "1.3.0", "1.3.0", VersionSource.LOCAL_CACHE_LATEST);
    }

    @Test
    public void testCentralTimeoutFallsBackToMinSupported() {
        assertFallbackOnCentralTimeout(() -> null, "1.2.0", VersionSource.MIN_SUPPORTED);
    }

    @Test
    public void testMinSupportedUsedWhenNoSupportedVersionAvailable() {
        assertResolved(ConnectorVersionResolver.resolveForNewDependency("1.2.0", () -> null, () -> null),
                "1.2.0", VersionSource.MIN_SUPPORTED);
        assertResolved(ConnectorVersionResolver.resolveForNewDependency("1.2.0", () -> null, () -> "1.1.9"),
                "1.2.0", VersionSource.MIN_SUPPORTED);
    }

    @Test
    public void testCandidatesBelowMinSupportedAreRejected() {
        assertResolved(ConnectorVersionResolver.resolveForNewDependency("1.2.0", () -> "1.0.0", () -> "1.4.0"),
                "1.4.0", VersionSource.LOCAL_CACHE_LATEST);
    }

    @Test
    public void testBlankAndMalformedCandidatesAreRejected() {
        assertResolved(ConnectorVersionResolver.resolveForNewDependency("1.2.0", () -> " ", () -> "not-a-version"),
                "1.2.0", VersionSource.MIN_SUPPORTED);
    }

    @Test
    public void testAnyCandidateSupportedWithoutMinSupported() {
        assertResolved(ConnectorVersionResolver.resolveForNewDependency(null, () -> "0.1.0", () -> null),
                "0.1.0", VersionSource.CENTRAL_LATEST);
        assertResolved(ConnectorVersionResolver.resolveForNewDependency("", () -> null, () -> "0.2.0"),
                "0.2.0", VersionSource.LOCAL_CACHE_LATEST);
    }

    private void assertFallbackOnCentralTimeout(Supplier<String> cachedLatest, String version, VersionSource source) {
        CountDownLatch centralBlocked = new CountDownLatch(1);
        Supplier<String> blockedCentral = () -> {
            try {
                centralBlocked.await();
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            return "9.9.9";
        };
        try {
            long start = System.nanoTime();
            ResolvedConnectorVersion resolved = ConnectorVersionResolver.resolveForNewDependency("1.2.0",
                    blockedCentral, cachedLatest, CENTRAL_TEST_TIMEOUT);
            Duration elapsed = Duration.ofNanos(System.nanoTime() - start);
            assertResolved(resolved, version, source);
            Assert.assertTrue(elapsed.compareTo(CENTRAL_TEST_TIMEOUT.multipliedBy(TIMEOUT_TOLERANCE_FACTOR)) < 0,
                    "a blocked Central lookup must not hold the request beyond the timeout, took " + elapsed);
        } finally {
            centralBlocked.countDown();
        }
    }

    private void assertResolved(ResolvedConnectorVersion resolved, String version, VersionSource source) {
        Assert.assertEquals(resolved.version(), version);
        Assert.assertEquals(resolved.source(), source);
    }

    private Project load(String resource) throws URISyntaxException {
        Path projectPath = Paths.get(getClass().getClassLoader().getResource(resource).toURI());
        return BuildProject.load(projectPath);
    }
}
