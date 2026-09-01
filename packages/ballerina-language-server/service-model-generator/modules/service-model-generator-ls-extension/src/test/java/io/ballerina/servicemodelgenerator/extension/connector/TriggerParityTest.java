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

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.annotations.SerializedName;
import com.google.gson.reflect.TypeToken;
import io.ballerina.modelgenerator.commons.PackageUtil;
import io.ballerina.modelgenerator.commons.trigger.models.TriggerUISchemaModel;
import io.ballerina.projects.Package;
import io.ballerina.projects.ProjectEnvironmentBuilder;
import io.ballerina.projects.bala.BalaProject;
import io.ballerina.projects.repos.TempDirCompilationCache;
import org.testng.Assert;
import org.testng.Reporter;
import org.testng.SkipException;
import org.testng.annotations.BeforeClass;
import org.testng.annotations.DataProvider;
import org.testng.annotations.Test;

import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.UncheckedIOException;
import java.lang.reflect.Type;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeMap;
import java.util.stream.Collectors;

/**
 * Byte-for-byte parity between every bundled runtime trigger model and the model generated from
 * packaged L1 + semantic facts + L2. This is the harness that drives Phase 4 of the L1+L2 completion
 * plan: it starts red against a recorded allow-list of known gaps (see {@code trigger-parity/gaps/}),
 * and each module's turn is done when its allow-list file is empty.
 *
 * <p>Two system properties support the per-module iteration loop:
 * <ul>
 *   <li>{@code -Dtrigger.parity.dump=<dir>} writes {@code <key>.diff.txt} (uncapped) plus
 *       pretty-printed, key-sorted {@code <key>.expected.json}/{@code <key>.actual.json} per module.</li>
 *   <li>{@code -Dtrigger.parity.record=true} rewrites {@code gaps/<key>.json} from what was observed --
 *       the "accept this baseline" button, used once and then essentially never.</li>
 * </ul>
 *
 * <p>A pin the local offline cache doesn't hold is skipped, not failed, naming the exact
 * {@code bal pull} line -- see {@link #logCorpusResolvability()}.
 */
public class TriggerParityTest {

    private static final Gson GSON = new Gson();
    private static final Gson PRETTY_GSON = new GsonBuilder().setPrettyPrinting().disableHtmlEscaping().create();
    private static final String CORPUS_RESOURCE = "trigger-parity/corpus.json";
    private static final String GAPS_RESOURCE_PREFIX = "trigger-parity/gaps/";
    /** Where {@code -Dtrigger.parity.record=true} writes back to; matches the module's own test-resource
     * layout convention (see {@code ServiceModelAPITests}'s {@code Paths.get("src/test/resources/...")}). */
    private static final Path GAPS_SOURCE_DIR = Path.of("src/test/resources/trigger-parity/gaps");
    /** Optional test-only bala repository root, normally supplied from an isolated copied .ballerina home. */
    private static final String BALA_REPOSITORY_PROPERTY = "trigger.parity.bala.repository";

    /**
     * One pinned connector to generate and compare against its bundled runtime model.
     *
     * @param key         the bundled resource base name (e.g. {@code sqs}, {@code mcp_1.0.3})
     * @param org         the connector's organization
     * @param packageName the connector's package name
     * @param module      the connector's module name
     * @param version     the exact pinned version the bundled model was authored against
     */
    record CorpusEntry(String key, String org, @SerializedName("package") String packageName, String module,
                       String version) {
    }

    record GapEntry(String path, String kind, String detail) {
    }

    record GapFixture(String module, String note, List<GapEntry> gaps) {
    }

    @BeforeClass
    public void logCorpusResolvability() {
        List<CorpusEntry> corpus = readCorpus();
        List<String> missing = new ArrayList<>();
        int resolvable = 0;
        for (CorpusEntry entry : corpus) {
            if (resolveOffline(entry).isPresent()) {
                resolvable++;
            } else {
                missing.add("bal pull " + entry.org() + "/" + entry.packageName() + ":" + entry.version());
            }
        }
        String message = "trigger parity corpus: " + resolvable + "/" + corpus.size() + " resolvable offline"
                + (missing.isEmpty() ? "" : "; missing:\n  " + String.join("\n  ", missing));
        Reporter.log(message, true);
    }

    @DataProvider(name = "corpus")
    public Object[][] corpus() {
        return readCorpus().stream().map(entry -> new Object[] {entry}).toArray(Object[][]::new);
    }

    @Test(dataProvider = "corpus")
    public void testParity(CorpusEntry entry) {
        Package pkg = resolveOffline(entry).orElse(null);
        if (pkg == null) {
            throw new SkipException(entry.key() + " is not resolvable offline; run: bal pull "
                    + entry.org() + "/" + entry.packageName() + ":" + entry.version());
        }

        TriggerUISchemaModel bundled = TriggerModelReader.getInstance()
                .getBundledTriggerModel(entry.module(), entry.version())
                .orElseThrow(() -> new AssertionError(entry.key() + ": no bundled runtime model registered "
                        + "for module " + entry.module() + "/" + entry.version()
                        + " (check bundled_trigger_models.json and trigger-parity/corpus.json agree)"));
        TriggerUISchemaModel generated = TriggerModelReader.getInstance()
                .getGeneratedTriggerModel(entry.org(), entry.module(), entry.version(), pkg)
                .orElseThrow(() -> new AssertionError(entry.key()
                        + ": package resolved offline but generation returned empty"));

        JsonObject expected = TriggerParityDiff.normalize(bundled);
        JsonObject actual = TriggerParityDiff.normalize(generated);
        List<TriggerParityDiff.Gap> observed = TriggerParityDiff.compare(expected, actual, "$");

        dumpIfRequested(entry.key(), expected, actual, observed);

        if (Boolean.getBoolean("trigger.parity.record")) {
            record(entry, observed);
            return;
        }

        GapFixture allowed = readGapFixture(entry.key());
        Set<GapKey> observedKeys = observed.stream().map(GapKey::of)
                .collect(Collectors.toCollection(LinkedHashSet::new));
        Set<GapKey> allowedKeys = allowed.gaps().stream().map(GapKey::of)
                .collect(Collectors.toCollection(LinkedHashSet::new));

        List<GapKey> regressions = observedKeys.stream().filter(key -> !allowedKeys.contains(key)).toList();
        List<GapKey> stale = allowedKeys.stream().filter(key -> !observedKeys.contains(key)).toList();

        if (regressions.isEmpty() && stale.isEmpty()) {
            return;
        }
        StringBuilder message = new StringBuilder(entry.key() + " parity gaps do not match the recorded allow-list "
                + "(trigger-parity/gaps/" + entry.key() + ".json). Run with -Dtrigger.parity.dump=<dir> to triage, "
                + "or -Dtrigger.parity.record=true once the change is intentional.\n");
        appendBucket(message, "NEW gaps (regression, " + regressions.size() + ")", regressions);
        appendBucket(message, "STALE gaps (fixed but still recorded, " + stale.size() + ")", stale);
        Assert.fail(message.toString());
    }

    private static void appendBucket(StringBuilder message, String title, List<GapKey> keys) {
        message.append(title).append(":\n");
        for (GapKey key : keys) {
            message.append("  ").append(key.path()).append(" [").append(key.kind()).append("]");
            if (key.detail() != null) {
                message.append(" -- ").append(key.detail());
            }
            message.append('\n');
        }
    }

    /**
     * The full gap identity. Value details are included so an allow-list cannot conceal a changed
     * expected or actual value at the same path and gap kind.
     *
     * @param path the JSONPath-ish location of the gap
     * @param kind {@code MISSING}/{@code UNEXPECTED}/{@code VALUE}/{@code ARRAY_SIZE}/{@code ORDER}
     * @param detail a human-readable description of the divergence
     */
    private record GapKey(String path, String kind, String detail) {
        static GapKey of(TriggerParityDiff.Gap gap) {
            return new GapKey(gap.path(), gap.kind(), gap.detail());
        }

        static GapKey of(GapEntry entry) {
            return new GapKey(entry.path(), entry.kind(), entry.detail());
        }
    }

    private void dumpIfRequested(String key, JsonObject expected, JsonObject actual,
                                 List<TriggerParityDiff.Gap> observed) {
        String dir = System.getProperty("trigger.parity.dump");
        if (dir == null || dir.isBlank()) {
            return;
        }
        try {
            Path target = Path.of(dir);
            Files.createDirectories(target);
            Files.writeString(target.resolve(key + ".expected.json"), PRETTY_GSON.toJson(sortKeys(expected)));
            Files.writeString(target.resolve(key + ".actual.json"), PRETTY_GSON.toJson(sortKeys(actual)));
            String diffText = observed.stream()
                    .map(gap -> gap.path() + " [" + gap.kind() + "] " + gap.detail())
                    .collect(Collectors.joining("\n"));
            Files.writeString(target.resolve(key + ".diff.txt"), diffText);
        } catch (IOException e) {
            throw new UncheckedIOException("failed writing trigger parity dump for " + key, e);
        }
    }

    private void record(CorpusEntry entry, List<TriggerParityDiff.Gap> observed) {
        List<GapEntry> entries = observed.stream()
                .map(gap -> new GapEntry(gap.path(), gap.kind(), gap.detail()))
                .toList();
        GapFixture existing = readGapFixture(entry.key());
        String note = existing.note() == null ? "" : existing.note();
        GapFixture rewritten = new GapFixture(entry.module(), note, entries);
        try {
            Files.createDirectories(GAPS_SOURCE_DIR);
            Files.writeString(GAPS_SOURCE_DIR.resolve(entry.key() + ".json"), PRETTY_GSON.toJson(rewritten));
        } catch (IOException e) {
            throw new UncheckedIOException("failed recording trigger parity gaps for " + entry.key(), e);
        }
        Reporter.log(entry.key() + ": recorded " + entries.size() + " gap(s)", true);
    }

    private static Optional<Package> resolveOffline(CorpusEntry entry) {
        Optional<Package> resolved = PackageUtil.getModulePackageOffline(PackageUtil.getSampleProject(), entry.org(),
                entry.packageName(), entry.version());
        return resolved.isPresent() ? resolved : resolveFromBalaRepository(entry);
    }

    /**
     * Loads a pinned bala directly for parity testing when the local repository index is incomplete. This is
     * deliberately test-only: production code must continue to use the normal Ballerina package resolver.
     */
    private static Optional<Package> resolveFromBalaRepository(CorpusEntry entry) {
        String repository = System.getProperty(BALA_REPOSITORY_PROPERTY);
        if (repository == null || repository.isBlank()) {
            return Optional.empty();
        }
        Path versionRoot = Path.of(repository).resolve(entry.org()).resolve(entry.packageName())
                .resolve(entry.version());
        if (!Files.isDirectory(versionRoot)) {
            return Optional.empty();
        }
        Path balaRoot;
        try {
            balaRoot = Files.list(versionRoot)
                    .filter(Files::isDirectory)
                    .filter(path -> path.getFileName().toString().equals("java21")
                            || path.getFileName().toString().equals("any"))
                    .findFirst()
                    .orElse(null);
        } catch (IOException e) {
            return Optional.empty();
        }
        if (balaRoot == null) {
            return Optional.empty();
        }
        try {
            ProjectEnvironmentBuilder builder = ProjectEnvironmentBuilder.getDefaultBuilder();
            builder.addCompilationCacheFactory(TempDirCompilationCache::from);
            BalaProject project = BalaProject.loadProject(builder, balaRoot);
            return Optional.ofNullable(project.currentPackage());
        } catch (RuntimeException e) {
            Reporter.log("Could not load bala for " + entry.org() + "/" + entry.packageName() + ":"
                    + entry.version() + ": " + e.getMessage(), true);
            return Optional.empty();
        }
    }

    private static List<CorpusEntry> readCorpus() {
        try (InputStream is = TriggerParityTest.class.getClassLoader().getResourceAsStream(CORPUS_RESOURCE)) {
            if (is == null) {
                throw new IllegalStateException("missing classpath resource " + CORPUS_RESOURCE);
            }
            Type type = new TypeToken<List<CorpusEntry>>() { }.getType();
            try (InputStreamReader reader = new InputStreamReader(is, StandardCharsets.UTF_8)) {
                List<CorpusEntry> corpus = GSON.fromJson(reader, type);
                return corpus == null ? List.of() : corpus;
            }
        } catch (IOException e) {
            throw new UncheckedIOException("failed reading " + CORPUS_RESOURCE, e);
        }
    }

    private static GapFixture readGapFixture(String key) {
        String resource = GAPS_RESOURCE_PREFIX + key + ".json";
        try (InputStream is = TriggerParityTest.class.getClassLoader().getResourceAsStream(resource)) {
            if (is == null) {
                return new GapFixture(key, null, List.of());
            }
            try (InputStreamReader reader = new InputStreamReader(is, StandardCharsets.UTF_8)) {
                GapFixture fixture = GSON.fromJson(reader, GapFixture.class);
                return fixture == null ? new GapFixture(key, null, List.of())
                        : new GapFixture(fixture.module(), fixture.note(),
                                fixture.gaps() == null ? List.of() : fixture.gaps());
            }
        } catch (IOException e) {
            throw new UncheckedIOException("failed reading " + resource, e);
        }
    }

    /** Recursively sorts object keys for dump-file readability; comparison itself never uses this --
     * container order is a real gap category (see {@link TriggerParityDiff}), not display noise. */
    private static JsonElement sortKeys(JsonElement element) {
        if (element.isJsonObject()) {
            Map<String, JsonElement> sorted = new TreeMap<>(Comparator.naturalOrder());
            element.getAsJsonObject().entrySet().forEach(e -> sorted.put(e.getKey(), sortKeys(e.getValue())));
            JsonObject object = new JsonObject();
            sorted.forEach(object::add);
            return object;
        }
        if (element.isJsonArray()) {
            JsonArray array = new JsonArray();
            element.getAsJsonArray().forEach(item -> array.add(sortKeys(item)));
            return array;
        }
        return element;
    }

}
