/*
 *  Copyright (c) 2024, WSO2 LLC. (http://www.wso2.com)
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

package io.ballerina.modelgenerator.commons;

import io.ballerina.centralconnector.CentralAPI;
import io.ballerina.centralconnector.RemoteCentral;
import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.projects.BuildOptions;
import io.ballerina.projects.Module;
import io.ballerina.projects.ModuleId;
import io.ballerina.projects.ModuleName;
import io.ballerina.projects.Package;
import io.ballerina.projects.PackageCompilation;
import io.ballerina.projects.PackageDescriptor;
import io.ballerina.projects.PackageName;
import io.ballerina.projects.PackageOrg;
import io.ballerina.projects.PackageVersion;
import io.ballerina.projects.Project;
import io.ballerina.projects.ProjectEnvironmentBuilder;
import io.ballerina.projects.bala.BalaProject;
import io.ballerina.projects.directory.BuildProject;
import io.ballerina.projects.environment.PackageMetadataResponse;
import io.ballerina.projects.environment.PackageRepository;
import io.ballerina.projects.environment.PackageResolver;
import io.ballerina.projects.environment.ResolutionOptions;
import io.ballerina.projects.environment.ResolutionRequest;
import io.ballerina.projects.environment.ResolutionResponse;
import io.ballerina.projects.internal.environment.BallerinaUserHome;
import io.ballerina.projects.repos.TempDirCompilationCache;
import io.ballerina.projects.util.ProjectConstants;
import org.ballerinalang.langserver.LSClientLogger;
import org.ballerinalang.langserver.common.utils.CommonUtil;
import org.ballerinalang.langserver.commons.BallerinaCompilerApi;
import org.ballerinalang.langserver.commons.eventsync.exceptions.EventSyncException;
import org.ballerinalang.langserver.commons.workspace.WorkspaceDocumentException;
import org.ballerinalang.langserver.commons.workspace.WorkspaceManager;
import org.eclipse.lsp4j.MessageType;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardOpenOption;
import java.util.Collection;
import java.util.Collections;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.Supplier;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Utility class that contains methods to perform package-related operations.
 *
 * @since 1.0.0
 */
public class PackageUtil {

    private static final Logger LOGGER = Logger.getLogger(PackageUtil.class.getName());

    private static final String BALLERINA_HOME_PROPERTY = "ballerina.home";

    /**
     * Whether resolution is forced offline (test runs). When true, callers must avoid contacting Ballerina Central
     * (e.g. live catalog/keyword lookups) so behaviour is deterministic and reproducible from the build-owned home.
     *
     * @return {@code true} if offline resolution is forced; {@code false} in production.
     */
    public static boolean isOffline() {
        return CommonUtil.TEST_OFFLINE;
    }

    // Owned by BallerinaCompilerApi so this stays loadable on distributions that predate PackageLockingMode.
    private static BuildOptions balaBuildOptions() {
        return BallerinaCompilerApi.getInstance().getBalaBuildOptions(CommonUtil.TEST_OFFLINE);
    }

    /**
     * Per-thread "sample project" used purely as a resolver environment for standalone module
     * lookups (the project itself is an empty in-memory package; only its {@link PackageResolver}
     * is used).
     *
     * <p><b>Why thread-local (context for the language-server team).</b> A {@code BuildProject}'s
     * {@code PackageResolver} resolves through its environment's {@code EnvironmentPackageCache},
     * which is a plain, unsynchronized {@code HashMap}; resolving a package writes into it. While
     * this was a single shared {@code BuildProject}, concurrent LS requests — flow-model, trigger,
     * connector and library-metadata generation all resolve here — mutated that one {@code HashMap}
     * from multiple threads and corrupted it (wso2/product-integrator#2193). Giving each thread its
     * own sample project (hence its own environment, resolver and cache) removes the shared mutable
     * state entirely, so these hot, shared LS paths need no locking. The expensive part — avoiding
     * a Central round trip per lookup — is preserved by {@link #SAMPLE_RESOLUTION_CACHE} below,
     * which stays shared because it holds only immutable data (resolved bala paths).
     *
     * <p>This is the app-side fix for the shared-resolver hazard. If the compiler later makes the
     * resolver / package cache concurrency-safe, this can collapse back to a single shared instance
     * with no change to callers.
     *
     * <p>Cost/lifecycle: the per-thread project is a lightweight in-memory load of the single shared
     * {@link #SAMPLE_PROJECT_DIR} (no per-thread temp directory), but its resolver environment does
     * retain that thread's lang-lib packages. A thread's instance is reclaimed by GC when the thread
     * dies — it is reachable only through the thread's own {@code ThreadLocalMap}, nothing else holds
     * it — so live memory tracks the number of threads currently resolving, not the number ever
     * seen. Cache <i>hits</i> never touch the resolver at all. Do not call {@link #getSampleProject()}
     * from short-lived threads spawned per request (e.g. a per-call cached thread pool): each such
     * thread would build a full resolver environment only to discard it when it dies.
     */
    private static final ThreadLocal<BuildProject> SAMPLE_PROJECT =
            ThreadLocal.withInitial(PackageUtil::createSampleProject);

    /**
     * The Ballerina local package repository, per thread, backed by that thread's sample-project
     * environment. Thread-local for the same reason as {@link #SAMPLE_PROJECT}: reading a package
     * through this repository ({@code getPackage}) loads it into the backing environment's
     * (unsynchronized) package cache, so a single shared instance would corrupt that cache under
     * concurrent access — the exact hazard #2193 describes, reached through a different door.
     */
    private static final ThreadLocal<PackageRepository> LOCAL_REPOSITORY =
            ThreadLocal.withInitial(() -> BallerinaUserHome.from(
                    getSampleProject().projectEnvironmentContext().environment()).localPackageRepository());

    private static final String PULLING_THE_MODULE_MESSAGE = "Pulling the module '%s' from the central";
    private static final String MODULE_PULLING_FAILED_MESSAGE = "Failed to pull the module: %s";
    private static final String MODULE_PULLING_SUCCESS_MESSAGE = "Successfully pulled the module: %s";

    // Concurrent map to store locks for each project
    private static final ConcurrentHashMap<Path, ReentrantLock> PROJECT_LOCKS = new ConcurrentHashMap<>();

    /**
     * Session cache for sample-project module resolutions, keyed by
     * {@code org:name:version:repository}. Resolving a module against the sample project is
     * extremely expensive — non-sticky resolution contacts Ballerina Central over HTTP even for
     * locally cached packages, and a missing package throws after a network round trip — and the
     * flow-model generator triggers one such resolution per remote-call node on EVERY
     * getFlowModel request. Before this cache, a single warm flow-model fetch took seconds of
     * pure network time.
     *
     * A bala package is immutable per version, so positive entries never go stale. The accepted
     * trade-off is that a "latest version" lookup or a transient network failure sticks for the
     * LS session.
     *
     * Caches the resolved bala path rather than the loaded package, which would retain that
     * package's syntax trees and symbols for the session.
     */
    private static final ConcurrentHashMap<String, Optional<Path>> SAMPLE_RESOLUTION_CACHE =
            new ConcurrentHashMap<>();

    // Namespaces offline-resolution cache entries so they never collide with the latest-version
    // entries from getModulePackage (whose miss can resolve — and pull — a newer online version).
    private static final String OFFLINE_RESOLUTION_KEY_PREFIX = "offline:";

    /**
     * Caches only resolved (immutable) bala paths, keyed by coordinates. Absence is never cached:
     * the module-pull flow retries through here, and a cached failure would outlive the network
     * problem that caused it.
     *
     * <p>No lock is needed. Resolution now runs on the calling thread's own sample project
     * ({@link #SAMPLE_PROJECT}), so concurrent misses touch per-thread resolver state, never shared
     * state. The cache is a {@link ConcurrentHashMap} of immutable paths; two threads racing the
     * same coordinate simply resolve it independently and store the identical path
     * ({@code putIfAbsent}). For a coordinate not yet pulled locally, both may ask the compiler to
     * pull it — the same behavior as before the sample project was shared (each call resolved on its
     * own project), relying on the compiler tolerating concurrent pulls of one package into the
     * shared local repository, which is independent of this class.
     */
    private static Optional<Path> memoizedSampleBala(String key, Supplier<Optional<Path>> resolution) {
        Optional<Path> cached = SAMPLE_RESOLUTION_CACHE.get(key);
        if (cached != null) {
            return cached;
        }
        Optional<Path> resolved;
        try {
            resolved = resolution.get();
        } catch (RuntimeException e) {
            // Absence is not cached (see javadoc), so a caller retry can still succeed; log the cause
            // so a Central outage or corrupted bala is distinguishable from a genuinely missing package.
            LOGGER.log(Level.FINE, "Sample-project resolution failed for " + key, e);
            return Optional.empty();
        }
        resolved.ifPresent(path -> SAMPLE_RESOLUTION_CACHE.putIfAbsent(key, Optional.of(path)));
        return resolved;
    }

    private static String sampleResolutionKey(String org, String name, String version, String repository) {
        return org + ":" + name + ":" + (version == null ? "<latest>" : version)
                + ":" + (repository == null ? "" : repository);
    }

    private static Optional<Package> loadBalaPackage(Path balaPath) {
        ProjectEnvironmentBuilder defaultBuilder = ProjectEnvironmentBuilder.getDefaultBuilder();
        defaultBuilder.addCompilationCacheFactory(TempDirCompilationCache::from);
        BalaProject balaProject = BalaProject.loadProject(defaultBuilder, balaPath, balaBuildOptions());
        return Optional.ofNullable(balaProject.currentPackage());
    }

    /**
     * Resolves the version of a package available in the local repositories (offline),
     * i.e. the version the build has provisioned. Returns null if not cached.
     */
    public static String cachedVersion(String org, String name) {
        try {
            PackageResolver resolver = getSampleProject().projectEnvironmentContext()
                    .getService(PackageResolver.class);
            Collection<PackageMetadataResponse> responses = resolver.resolvePackageMetadata(
                    Collections.singletonList(ResolutionRequest.from(
                            PackageDescriptor.from(PackageOrg.from(org), PackageName.from(name)))),
                    ResolutionOptions.builder().setOffline(true).build());
            Optional<PackageMetadataResponse> first = responses.stream().findFirst();
            if (first.isPresent()
                    && first.get().resolutionStatus() != ResolutionResponse.ResolutionStatus.UNRESOLVED) {
                return first.get().resolvedDescriptor().version().toString();
            }
        } catch (RuntimeException ignored) {
            // fall through to null
        }
        return null;
    }

    /**
     * Returns the calling thread's sample project, used for resolving standalone module packages.
     * See {@link #SAMPLE_PROJECT} for why this is per-thread. It is built once per thread; callers
     * on the same thread reuse it.
     *
     * <p><b>Contract:</b> the returned project is confined to the calling thread. Do not stash it
     * (or anything derived from its environment/resolver) in a static or otherwise cross-thread
     * field — doing so re-shares the non-thread-safe resolver and reintroduces #2193.
     */
    public static BuildProject getSampleProject() {
        return SAMPLE_PROJECT.get();
    }

    /**
     * The Ballerina local package repository for the calling thread, backed by that thread's
     * sample-project environment. Use this instead of building one from {@link #getSampleProject()}
     * yourself, so the thread-confinement contract stays in one place. See {@link #LOCAL_REPOSITORY}.
     */
    public static PackageRepository localPackageRepository() {
        return LOCAL_REPOSITORY.get();
    }

    /**
     * Whether {@code buildProject} is the calling thread's sample project (i.e. its resolution is
     * memoizable). Every caller passes {@link #getSampleProject()} on the same thread, so an
     * identity compare against this thread's {@code ThreadLocal} value is exact and needs no registry.
     */
    private static boolean isSampleProject(BuildProject buildProject) {
        return buildProject == SAMPLE_PROJECT.get();
    }

    /**
     * On-disk source of the sample project, created once for the whole process. Every thread's
     * {@link #SAMPLE_PROJECT} is an in-memory load of this one directory, so per-thread projects add
     * no per-thread temp directories — only their own resolver environment. The directory is only
     * ever loaded, never built or compiled, and module resolution writes external balas to the
     * user's central repository rather than here, so concurrent per-thread loads of it are read-only
     * and safe. Registered for best-effort deletion on JVM exit (see {@link #createSampleProjectDir}).
     */
    private static final Path SAMPLE_PROJECT_DIR = createSampleProjectDir();

    private static Path createSampleProjectDir() {
        // Obtain the Ballerina distribution path (process-global; set once).
        String ballerinaHome = System.getProperty(BALLERINA_HOME_PROPERTY);
        if (ballerinaHome == null || ballerinaHome.isEmpty()) {
            Path currentPath = getPath(Paths.get(
                    PackageUtil.class.getProtectionDomain().getCodeSource().getLocation().getPath()));
            Path distributionPath = getParentPath(getParentPath(getParentPath(currentPath)));
            System.setProperty(BALLERINA_HOME_PROPERTY, distributionPath.toString());
        }

        try {
            // Create a temporary directory with an empty main.bal and a minimal Ballerina.toml.
            Path tempDir = Files.createTempDirectory("ballerina-sample");
            Path mainBalFile = tempDir.resolve("main.bal");
            Files.createFile(mainBalFile);
            Path ballerinaTomlFile = tempDir.resolve("Ballerina.toml");
            String tomlContent = "[package]\n" +
                    "org = \"wso2\"\n" +
                    "name = \"sample\"\n" +
                    "version = \"0.1.0\"\n" +
                    "distribution = \"2201.12.0\"";
            Files.writeString(ballerinaTomlFile, tomlContent, StandardOpenOption.CREATE);
            // Best-effort cleanup. deleteOnExit is LIFO, so register the directory before its files:
            // the files are removed first, leaving the directory empty when it is deleted at shutdown.
            // If the load ever leaves extra files here, the non-empty directory delete simply no-ops.
            tempDir.toFile().deleteOnExit();
            mainBalFile.toFile().deleteOnExit();
            ballerinaTomlFile.toFile().deleteOnExit();
            return tempDir;
        } catch (IOException e) {
            throw new RuntimeException("Error occurred while creating the sample project", e);
        }
    }

    private static BuildProject createSampleProject() {
        return BuildProject.load(SAMPLE_PROJECT_DIR);
    }

    /**
     * Retrieves the semantic model for a given package identified by organization, name, and version.
     *
     * @param moduleInfo The module information
     * @return An Optional containing the semantic model.
     */
    public static Optional<SemanticModel> getSemanticModel(ModuleInfo moduleInfo) {
        Optional<Package> modulePackage = getModulePackage(getSampleProject(), moduleInfo.org(),
                moduleInfo.packageName(), moduleInfo.version());
        if (modulePackage.isEmpty()) {
            return Optional.empty();
        }
        Package pkg = modulePackage.get();
        for (Module module : pkg.modules()) {
            if (module.moduleName().toString().equals(moduleInfo.moduleName())) {
                return Optional.of(getCompilation(pkg).getSemanticModel(module.moduleId()));
            }
        }
        return Optional.empty();
    }

    public static Optional<SemanticModel> getSemanticModel(String org, String name) {
        return getModulePackage(getSampleProject(), org, name).map(
                pkg -> getCompilation(pkg).getSemanticModel(pkg.getDefaultModule().moduleId()));
    }

    /**
     * Retrieves a package matching the specified organization, name, and version. If the package is not found in the
     * local cache, it attempts to fetch it from the remote repository.
     *
     * @param buildProject The build project context
     * @param org          The organization name of the package
     * @param name         The name of the package
     * @param version      The version of the package
     * @return An Optional containing the matching Package if found, empty Optional otherwise
     */
    public static Optional<Package> getModulePackage(BuildProject buildProject, String org, String name,
                                                     String version) {
        Optional<Package> resolved = getModulePackage(buildProject, org, name, version, null);
        if (resolved.isPresent()) {
            return resolved;
        }
        // Unreleased versions (e.g. an in-development ballerina/workflow build) are not on
        // central; fall back to the local repository, where such builds are published.
        return getModulePackage(buildProject, org, name, version, ProjectConstants.LOCAL_REPOSITORY_NAME);
    }

    /**
     * Retrieves a package from a specific Ballerina repository.
     *
     * @param repository the Ballerina repository name, for example {@code local}; {@code null} uses the default
     *                   repository resolution
     */
    public static Optional<Package> getModulePackage(BuildProject buildProject, String org, String name,
                                                     String version, String repository) {
        // Sample-project resolutions are descriptor-only (the project just supplies a resolver
        // environment, and the returned bala is loaded with the default environment), so they
        // are safe to memoize across requests. Resolutions against a caller's real project may
        // depend on that project's state — leave them uncached.
        if (isSampleProject(buildProject)) {
            return memoizedSampleBala(sampleResolutionKey(org, name, version, repository),
                    () -> resolveVersionedModuleBala(buildProject, org, name, version, repository))
                    .flatMap(PackageUtil::loadBalaPackage);
        }
        return resolveVersionedModuleBala(buildProject, org, name, version, repository)
                .flatMap(PackageUtil::loadBalaPackage);
    }

    private static Optional<Path> resolveVersionedModuleBala(BuildProject buildProject, String org, String name,
                                                             String version, String repository) {
        PackageOrg packageOrg = PackageOrg.from(org);
        PackageName packageName = PackageName.from(name);
        PackageVersion packageVersion = PackageVersion.from(version);
        PackageDescriptor packageDescriptor = repository == null
                ? PackageDescriptor.from(packageOrg, packageName, packageVersion)
                : PackageDescriptor.from(packageOrg, packageName, packageVersion, repository);
        PackageResolver packageResolver = buildProject.projectEnvironmentContext().getService(PackageResolver.class);

        // Offline-first: an exact-version bala is immutable, so a local-cache hit is guaranteed
        // to equal the remote answer — no reason to contact Central for it. Only a local miss
        // falls back to online resolution (which can pull the package).
        ResolutionRequest resolutionRequest = ResolutionRequest.from(packageDescriptor);
        Optional<ResolutionResponse> resolutionResponse =
                resolveResponse(packageResolver, resolutionRequest, true);
        if (resolutionResponse.isEmpty() && !CommonUtil.TEST_OFFLINE) {
            resolutionResponse = resolveResponse(packageResolver, resolutionRequest, false);
        }
        if (resolutionResponse.isEmpty()) {
            return Optional.empty();
        }
        return Optional.of(resolutionResponse.get().resolvedPackage().project().sourceRoot());
    }

    /**
     * A response is only usable when it actually {@code RESOLVED} — {@code resolvePackages} can return
     * a non-empty collection containing an {@code UNRESOLVED} entry (with a {@code null} {@code
     * resolvedPackage()}) rather than an empty collection, which previously slipped past an {@code
     * isEmpty()} check and threw a {@code NullPointerException} on {@code resolvedPackage().project()}
     * — silently swallowed by callers' broad {@code catch (Throwable)}, masquerading as "package not
     * found".
     */
    private static Optional<ResolutionResponse> resolveResponse(PackageResolver packageResolver,
                                                                 ResolutionRequest resolutionRequest,
                                                                 boolean offline) {
        return packageResolver.resolvePackages(Collections.singletonList(resolutionRequest),
                        ResolutionOptions.builder().setOffline(offline).setSticky(false).build())
                .stream()
                .filter(response -> response.resolutionStatus() == ResolutionResponse.ResolutionStatus.RESOLVED)
                .findFirst();
    }

    public static Optional<Package> getModulePackage(BuildProject buildProject, String org, String name) {
        // See the versioned overload for why sample-project resolutions are memoized. The
        // "latest version" lookup below can itself hit Central, so caching matters just as much.
        if (isSampleProject(buildProject)) {
            return memoizedSampleBala(sampleResolutionKey(org, name, null, null),
                    () -> resolveLatestModuleBala(buildProject, org, name)).flatMap(PackageUtil::loadBalaPackage);
        }
        return resolveLatestModuleBala(buildProject, org, name).flatMap(PackageUtil::loadBalaPackage);
    }

    private static Optional<Path> resolveLatestModuleBala(BuildProject buildProject, String org, String name) {
        ResolutionRequest resolutionRequest = ResolutionRequest.from(
                PackageDescriptor.from(PackageOrg.from(org), PackageName.from(name)));
        PackageResolver packageResolver = buildProject.projectEnvironmentContext().getService(PackageResolver.class);
        Collection<PackageMetadataResponse> packageMetadataResponses = packageResolver.resolvePackageMetadata(
                Collections.singletonList(resolutionRequest),
                ResolutionOptions.builder().setOffline(true).build());
        Optional<PackageMetadataResponse> pkgMetadata = packageMetadataResponses.stream().findFirst();
        PackageDescriptor packageDescriptor;
        if (pkgMetadata.isEmpty() ||
                pkgMetadata.get().resolutionStatus() == ResolutionResponse.ResolutionStatus.UNRESOLVED) {
            if (CommonUtil.TEST_OFFLINE) {
                // Not in the local repositories and network fallback is disabled.
                return Optional.empty();
            }
            // If the package metadata is not found locally, fetch the latest version from the central repository
            CentralAPI centralApi = RemoteCentral.getInstance();
            String version = centralApi.latestPackageVersion(org, name);
            packageDescriptor = PackageDescriptor.from(
                    PackageOrg.from(org), PackageName.from(name), PackageVersion.from(version));
        } else {
            packageDescriptor = pkgMetadata.get().resolvedDescriptor();
        }

        // Offline-first: the descriptor now carries an exact version (from the local metadata
        // or the remote latest-version lookup above), and an exact-version bala is immutable —
        // resolve from the local cache when present, contact Central only on a local miss.
        Collection<ResolutionResponse> resolutionResponses = packageResolver.resolvePackages(
                Collections.singletonList(ResolutionRequest.from(packageDescriptor)),
                ResolutionOptions.builder().setOffline(true).build());
        Optional<ResolutionResponse> resolutionResponse = resolutionResponses.stream()
                .filter(response -> response.resolvedPackage() != null).findFirst();
        if (resolutionResponse.isEmpty() && !CommonUtil.TEST_OFFLINE) {
            resolutionResponses = packageResolver.resolvePackages(
                    Collections.singletonList(ResolutionRequest.from(packageDescriptor)),
                    ResolutionOptions.builder().setOffline(false).build());
            resolutionResponse = resolutionResponses.stream()
                    .filter(response -> response.resolvedPackage() != null).findFirst();
        }
        if (resolutionResponse.isEmpty()) {
            // The package could not be resolved from the local repositories or Central.
            return Optional.empty();
        }
        return Optional.of(resolutionResponse.get().resolvedPackage().project().sourceRoot());
    }

    /**
     * Offline counterpart of {@link #getModulePackage(BuildProject, String, String)}: resolves a module
     * package strictly from what's already available locally, never reaching out to Central. Returns
     * {@code Optional.empty()} when the package isn't already resolvable offline, leaving the decision
     * to actually pull it to the LS's existing explicit, user-notified pull flow (see
     * {@link #pullModuleAndNotify}) rather than pulling it silently as a side effect of a read.
     */
    public static Optional<Package> getModulePackageOffline(String org, String name) {
        // Memoize the immutable offline bala path under a distinct "offline:" key — kept separate
        // from getModulePackage's latest-version cache, whose miss may pull a newer online version —
        // so repeat lookups skip the resolver entirely. Only the resolve touches the thread-local
        // resolver; the bala load uses a fresh environment per call (see loadBalaPackage).
        return memoizedSampleBala(OFFLINE_RESOLUTION_KEY_PREFIX + sampleResolutionKey(org, name, null, null),
                () -> resolveOfflineModuleBala(org, name)).flatMap(PackageUtil::loadBalaPackage);
    }

    private static Optional<Path> resolveOfflineModuleBala(String org, String name) {
        ResolutionRequest resolutionRequest = ResolutionRequest.from(
                PackageDescriptor.from(PackageOrg.from(org), PackageName.from(name)));
        PackageResolver packageResolver = getSampleProject().projectEnvironmentContext()
                .getService(PackageResolver.class);
        Optional<PackageMetadataResponse> pkgMetadata = packageResolver.resolvePackageMetadata(
                        Collections.singletonList(resolutionRequest),
                        ResolutionOptions.builder().setOffline(true).build()).stream()
                .findFirst();
        if (pkgMetadata.isEmpty()
                || pkgMetadata.get().resolutionStatus() == ResolutionResponse.ResolutionStatus.UNRESOLVED) {
            return Optional.empty();
        }

        // Filter for a RESOLVED entry (matching resolveLatestModuleBala): resolvePackages can return
        // a non-empty collection whose single entry is UNRESOLVED with a null resolvedPackage(),
        // which would otherwise NPE on resolvedPackage().project().
        return packageResolver.resolvePackages(
                        Collections.singletonList(ResolutionRequest.from(pkgMetadata.get().resolvedDescriptor())),
                        ResolutionOptions.builder().setOffline(true).build()).stream()
                .filter(response -> response.resolvedPackage() != null)
                .findFirst()
                .map(response -> response.resolvedPackage().project().sourceRoot());
    }

    public static boolean isModuleUnresolved(String org, String name, String version) {
        ResolutionRequest resolutionRequest = ResolutionRequest.from(
                PackageDescriptor.from(PackageOrg.from(org), PackageName.from(name), PackageVersion.from(version)));
        PackageResolver packageResolver = getSampleProject().projectEnvironmentContext()
                .getService(PackageResolver.class);
        return packageResolver.resolvePackageMetadata(Collections.singletonList(resolutionRequest),
                        ResolutionOptions.builder().setOffline(true).build()).stream()
                .findFirst()
                .map(response -> response.resolutionStatus() == ResolutionResponse.ResolutionStatus.UNRESOLVED)
                .orElse(false);
    }

    private static Path getPath(Path path) {
        return Objects.requireNonNull(path, "Path cannot be null");
    }

    private static Path getParentPath(Path path) {
        return Objects.requireNonNull(path, "Path cannot be null").getParent();
    }

    /**
     * Load the project from the given file path.
     *
     * @param workspaceManager the workspace manager
     * @param filePath         the file path
     * @return the loaded project
     */
    public static Project loadProject(WorkspaceManager workspaceManager, Path filePath) {
        try {
            return workspaceManager.loadProject(filePath);
        } catch (WorkspaceDocumentException | EventSyncException e) {
            throw new RuntimeException("Error loading project: " + e.getMessage());
        }
    }

    /**
     * Retrieves the semantic model of the default module of a package if the package details match the provided
     * organization, package name, and version.
     *
     * @param workspaceManager the workspace manager used to load the project
     * @param filePath         the path to the file from which the project should be loaded
     * @param orgName          the organization name that must match the package descriptor's organization value
     * @param packageName      the package name that must match the package descriptor's name value
     * @param modulePartName   the module part name that must match the package descriptor's submodule part name value
     * @param version          the version that must match the package descriptor's version value
     * @return an Optional containing the semantic model
     */
    public static Optional<SemanticModel> getSemanticModelIfMatched(WorkspaceManager workspaceManager, Path filePath,
                                                                    String orgName, String packageName,
                                                                    String modulePartName,
                                                                    String version) {
        try {
            Project project = workspaceManager.loadProject(filePath);
            Package currentPackage = project.currentPackage();
            PackageDescriptor descriptor = currentPackage.descriptor();
            if (descriptor.org().value().equals(orgName) &&
                    descriptor.name().value().equals(packageName) &&
                    descriptor.version().value().toString().equals(version)) {
                ModuleId moduleId = currentPackage.getDefaultModule().moduleId();
                if (Objects.nonNull(modulePartName) && !modulePartName.isEmpty()
                        && !packageName.equals(modulePartName)) {
                    ModuleName subModuleName = ModuleName.from(PackageName.from(packageName), modulePartName);
                    Module module = currentPackage.module(subModuleName);
                    if (module == null) {
                        for (Module mod : currentPackage.modules()) {
                            if (mod.moduleName().toString().equals(modulePartName)) {
                                module = mod;
                                break;
                            }
                        }
                        if (module == null) {
                            return Optional.empty();
                        }
                    }
                    moduleId = module.moduleId();
                }
                return Optional.of(PackageUtil.getCompilation(currentPackage).getSemanticModel(moduleId));
            }
        } catch (WorkspaceDocumentException | EventSyncException e) {
        }
        return Optional.empty();
    }

    /**
     * Retrieves the semantic model for a package from sibling projects within the same workspace.
     *
     * @param project     the current project used to find the workspace
     * @param org         the organization name of the target package
     * @param packageName the package name of the target package
     * @param moduleName  the module name of the target package
     * @return an Optional containing the semantic model and package if a matching sibling project is found
     */
    public static Optional<WorkspacePackageResolution> getSemanticModelFromWorkspace(Project project, String org,
                                                                                      String packageName,
                                                                                      String moduleName) {
        return getSemanticModelFromWorkspace(project, org, packageName, moduleName, null);
    }

    /**
     * Retrieves the semantic model for a version-matching package from sibling projects within the same workspace.
     *
     * @param project     the current project used to find the workspace
     * @param org         the organization name of the target package
     * @param packageName the package name of the target package
     * @param moduleName  the module name of the target package
     * @param version     the requested package version, or null when any workspace version is acceptable
     * @return an Optional containing the semantic model and package if a matching sibling project is found
     */
    public static Optional<WorkspacePackageResolution> getSemanticModelFromWorkspace(Project project, String org,
                                                                                      String packageName,
                                                                                      String moduleName,
                                                                                      String version) {
        BallerinaCompilerApi compilerApi = BallerinaCompilerApi.getInstance();
        Optional<Project> workspaceProject = compilerApi.getWorkspaceProject(project);
        if (workspaceProject.isEmpty()) {
            return Optional.empty();
        }
        List<Project> childProjects = compilerApi.getWorkspaceProjectsInOrder(workspaceProject.get());
        for (Project childProject : childProjects) {
            Package currentPackage = childProject.currentPackage();
            String currentPackageName = currentPackage.packageName().value();
            boolean orgMatches = currentPackage.packageOrg().value().equals(org);
            boolean nameMatches = currentPackageName.equals(packageName) || currentPackageName.equals(moduleName);
            boolean versionMatches = version == null
                    || currentPackage.descriptor().version().toString().equals(version);
            if (!orgMatches || !nameMatches || !versionMatches) {
                continue;
            }

            ModuleId moduleId = currentPackage.getDefaultModule().moduleId();
            if (moduleName == null || moduleName.isEmpty() || currentPackageName.equals(moduleName)) {
                return Optional.of(new WorkspacePackageResolution(
                        getCompilation(childProject).getSemanticModel(moduleId), currentPackage));
            }
            for (Module mod : currentPackage.modules()) {
                if (mod.moduleName().toString().equals(moduleName)) {
                    return Optional.of(new WorkspacePackageResolution(
                            getCompilation(childProject).getSemanticModel(mod.moduleId()), currentPackage));
                }
            }
            return Optional.empty();
        }
        return Optional.empty();
    }

    /**
     * Finds a workspace-sibling package matching the given org and package/module name.
     * <p>
     * Use this to skip a Central round-trip when the target package lives next door in the same
     * workspace. The match accepts either {@code packageName} or {@code moduleName} on the sibling's
     * package name so callers can pass whichever they have.
     *
     * @param project     the current project used to discover the workspace
     * @param org         the target package's organization
     * @param packageName the target package name (may be {@code null} if only {@code moduleName} is known)
     * @param moduleName  the target module name (may be {@code null} if only {@code packageName} is known)
     * @return the matching workspace sibling's {@link Package}, or empty if none found / not in a workspace
     */
    public static Optional<Package> findWorkspacePackage(Project project, String org, String packageName,
                                                         String moduleName) {
        if (project == null || org == null) {
            return Optional.empty();
        }
        try {
            BallerinaCompilerApi compilerApi = BallerinaCompilerApi.getInstance();
            Optional<Project> workspaceProject = compilerApi.getWorkspaceProject(project);
            if (workspaceProject.isEmpty()) {
                return Optional.empty();
            }
            for (Project childProject : compilerApi.getWorkspaceProjectsInOrder(workspaceProject.get())) {
                Package currentPackage = childProject.currentPackage();
                String currentPackageName = currentPackage.packageName().value();
                if (currentPackage.packageOrg().value().equals(org)
                        && (currentPackageName.equals(packageName) || currentPackageName.equals(moduleName))) {
                    return Optional.of(currentPackage);
                }
            }
        } catch (RuntimeException e) {
            // Best-effort: callers fall back to Central resolution.
        }
        return Optional.empty();
    }

    public record WorkspacePackageResolution(SemanticModel semanticModel, Package resolvedPackage) {
    }

    public static ModuleInfo fetchVersionIfNotExists(ModuleInfo moduleInfo) {
        if (moduleInfo.version() == null) {
            String version = CommonUtil.TEST_OFFLINE
                    ? cachedVersion(moduleInfo.org(), moduleInfo.packageName())
                    : RemoteCentral.getInstance().latestPackageVersion(moduleInfo.org(), moduleInfo.packageName());
            // Under CommonUtil.TEST_OFFLINE a null version means the package was never provisioned into the build-owned
            // cache. Fail loudly (matching the CommonUtil.TEST_OFFLINE contract above) so a missing lock entry is
            // self-diagnosing, rather than silently degrading into an empty model downstream.
            if (CommonUtil.TEST_OFFLINE && version == null) {
                throw new IllegalStateException(String.format(
                        "Package '%s/%s' is not provisioned in the offline test cache. Add it to "
                        + "build-config/ballerina_dependencies (Ballerina.toml) " + "and regenerate Dependencies.toml.",
                        moduleInfo.org(), moduleInfo.packageName()));
            }
            return new ModuleInfo(moduleInfo.org(), moduleInfo.packageName(), moduleInfo.moduleName(), version);
        }
        return moduleInfo;
    }

    public static Optional<Package> pullModuleAndNotify(LSClientLogger lsClientLogger, ModuleInfo moduleInfo) {
        ModuleInfo completeModuleInfo = fetchVersionIfNotExists(moduleInfo);
        Optional<Package> modulePackage;
        if (PackageUtil.isModuleUnresolved(completeModuleInfo.org(), completeModuleInfo.packageName(),
                completeModuleInfo.version())) {
            notifyClient(lsClientLogger, completeModuleInfo, MessageType.Info, PULLING_THE_MODULE_MESSAGE);
            modulePackage = getModulePackage(getSampleProject(), completeModuleInfo.org(),
                    completeModuleInfo.packageName(), completeModuleInfo.version());
            if (modulePackage.isEmpty()) {
                notifyClient(lsClientLogger, completeModuleInfo, MessageType.Error, MODULE_PULLING_FAILED_MESSAGE);
            } else {
                notifyClient(lsClientLogger, completeModuleInfo, MessageType.Info, MODULE_PULLING_SUCCESS_MESSAGE);
            }
        } else {
            modulePackage = getModulePackage(getSampleProject(), completeModuleInfo.org(),
                    completeModuleInfo.packageName(), completeModuleInfo.version());
        }
        return modulePackage;
    }

    private static void notifyClient(LSClientLogger lsClientLogger, ModuleInfo moduleInfo, MessageType messageType,
                                     String message) {
        if (lsClientLogger != null) {
            String signature =
                    String.format("%s/%s:%s", moduleInfo.org(), moduleInfo.packageName(), moduleInfo.version());
            lsClientLogger.notifyClient(messageType, String.format(message, signature));
        }
    }

    /**
     * Safely retrieves compilation from a project using a lock to ensure thread safety.
     *
     * @param balPackage The package from which to retrieve the compilation
     * @return The compilation of the project
     */
    public static PackageCompilation getCompilation(Package balPackage) {
        Path id = balPackage.project().sourceRoot();
        ReentrantLock lock = PROJECT_LOCKS.computeIfAbsent(id, k -> new ReentrantLock());
        lock.lock();
        try {
            return balPackage.getCompilation();
        } finally {
            lock.unlock();
        }
    }

    public static PackageCompilation getCompilation(Project project) {
        return getCompilation(project.currentPackage());
    }

    /**
     * Safely resolves a module package with error handling for cases where packages don't exist in Central.
     * This utility method encapsulates the common pattern of trying to resolve a package and falling back
     * to an empty Optional if resolution fails.
     *
     * @param org         The organization name of the package
     * @param packageName The name of the package
     * @return An Optional containing the resolved Package if successful, empty Optional if resolution fails
     */
    public static Optional<Package> resolveModulePackage(String org, String packageName, String version) {
        try {
            if (version == null) {
                return getModulePackage(getSampleProject(), org, packageName);
            } else {
                return getModulePackage(getSampleProject(), org, packageName, version);
            }
        } catch (Exception e) {
            // If package resolution fails (e.g., package doesn't exist in Central),
            // treat it as a generated/test package and continue with empty resolved package
            return Optional.empty();
        }
    }

    /**
     * Determines if a function is local to the current workspace project.
     *
     * @param workspaceManager The workspace manager
     * @param filePath         The path to the current file
     * @param org              The organization name
     * @param moduleName       The module name
     * @return true if the function is local to the current project, false otherwise
     */
    public static boolean isLocalFunction(WorkspaceManager workspaceManager, Path filePath, String org,
                                          String moduleName) {
        if (org == null || moduleName == null) {
            return false;
        }
        try {
            Project project = workspaceManager.loadProject(filePath);
            PackageDescriptor descriptor = project.currentPackage().descriptor();
            String packageOrg = descriptor.org().value();
            String packageName = descriptor.name().value();

            return packageOrg.equals(org) && packageName.equals(moduleName);
        } catch (WorkspaceDocumentException | EventSyncException e) {
            return false;
        }
    }
}
