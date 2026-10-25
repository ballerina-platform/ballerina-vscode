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

import io.ballerina.modelgenerator.commons.CommonUtils;
import io.ballerina.projects.Document;
import io.ballerina.projects.DocumentId;
import io.ballerina.projects.Module;
import io.ballerina.projects.ModuleId;
import io.ballerina.projects.Package;
import io.ballerina.projects.Project;
import io.ballerina.projects.ProjectEnvironmentBuilder;
import io.ballerina.projects.bala.BalaProject;
import io.ballerina.projects.repos.TempDirCompilationCache;
import org.testng.Assert;
import org.testng.SkipException;
import org.testng.annotations.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.InvalidPathException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Stream;

/**
 * Tests for {@link CommonUtils#findDocument(Package, String)} on bala packages: the in-memory lookup must return
 * exactly what the {@code Project.documentId} lookup it replaces returned.
 *
 * @since 1.7.0
 */
public class FindDocumentTest {

    private static final Path FIXTURE = Path.of("src", "test", "resources", "find-document", "bala",
            "testorg", "demo", "1.0.0", "any");

    @Test(description = "Default-module files are found; submodule-only, missing and malformed names are not.")
    public void testFixtureBala() {
        Package pkg = loadBala(FIXTURE.toAbsolutePath());

        Document main = CommonUtils.findDocument(pkg, "main.bal");
        Assert.assertNotNull(main);
        Assert.assertEquals(main.module().moduleId(), pkg.getDefaultModule().moduleId());
        Assert.assertTrue(main.textDocument().toString().contains("defaultMain"));
        Assert.assertEquals(CommonUtils.findDocument(pkg, "types.bal").name(), "types.bal");

        // util.bal exists only in the demo.util submodule; the lookup only covers the default module
        Assert.assertNull(CommonUtils.findDocument(pkg, "util.bal"));
        for (String name : List.of("missing.bal", "", "MAIN.bal", "./main.bal", "../demo/main.bal",
                "demo/main.bal", "main", "Package.md")) {
            Assert.assertNull(CommonUtils.findDocument(pkg, name), "unexpected match for '" + name + "'");
        }
        Assert.assertNull(CommonUtils.findDocument(null, "main.bal"));
        assertSameAsDocumentIdLookup(pkg, candidateNames(pkg));
    }

    @Test(description = "On every bala in the test Ballerina home, the lookup matches the documentId lookup.")
    public void testMatchesDocumentIdLookupOnRealBalas() throws IOException {
        String home = System.getenv("BALLERINA_HOME_DIR");
        Path balaRoot = home == null ? null : Path.of(home, "repositories", "central.ballerina.io", "bala");
        if (balaRoot == null || !Files.isDirectory(balaRoot)) {
            throw new SkipException("no bala repository under BALLERINA_HOME_DIR");
        }
        List<Path> balas;
        try (Stream<Path> paths = Files.find(balaRoot, 4, (path, attrs) -> attrs.isDirectory()
                && path.getNameCount() - balaRoot.getNameCount() == 4
                && Files.exists(path.resolve("package.json")))) {
            balas = paths.sorted().toList();
        }
        Assert.assertFalse(balas.isEmpty(), "no balas found under " + balaRoot);

        int checked = 0;
        long legacyNanos = 0;
        long lookupNanos = 0;
        for (Path bala : balas) {
            Package pkg = loadBala(bala);
            List<String> names = candidateNames(pkg);
            long start = System.nanoTime();
            names.forEach(name -> {
                try {
                    legacyFindDocument(pkg, name);
                } catch (InvalidPathException ignored) {
                    // timed as well; asserted below
                }
            });
            legacyNanos += System.nanoTime() - start;
            start = System.nanoTime();
            names.forEach(name -> CommonUtils.findDocument(pkg, name));
            lookupNanos += System.nanoTime() - start;
            checked += assertSameAsDocumentIdLookup(pkg, names);
        }
        System.out.printf("findDocument: %d balas, %d lookups; documentId lookup %d ms, in-memory %d ms%n",
                balas.size(), checked, legacyNanos / 1_000_000, lookupNanos / 1_000_000);
    }

    private static int assertSameAsDocumentIdLookup(Package pkg, List<String> names) {
        for (String name : names) {
            Document actual = CommonUtils.findDocument(pkg, name);
            String where = pkg.packageOrg().value() + "/" + pkg.packageName().value() + ":"
                    + pkg.packageVersion() + " '" + name + "'";
            Document expected;
            try {
                expected = legacyFindDocument(pkg, name);
            } catch (InvalidPathException e) {
                // The old lookup threw for names that aren't valid paths here (e.g. a trailing space on Windows);
                // no document can have such a name, so the new lookup finds nothing instead of throwing.
                Assert.assertNull(actual, "a name that is no valid path matched a document: " + where);
                continue;
            }
            if (expected == null) {
                Assert.assertNull(actual, "documentId lookup found nothing, in-memory found a document: " + where);
            } else {
                Assert.assertNotNull(actual, "documentId lookup found a document, in-memory found nothing: " + where);
                Assert.assertEquals(actual.documentId(), expected.documentId(), where);
            }
        }
        return names.size();
    }

    // Every file name of every module, plus near misses of them.
    private static List<String> candidateNames(Package pkg) {
        Set<String> names = new LinkedHashSet<>();
        for (ModuleId moduleId : pkg.moduleIds()) {
            Module module = pkg.module(moduleId);
            module.documentIds().forEach(id -> names.add(module.document(id).name()));
            module.testDocumentIds().forEach(id -> names.add(module.document(id).name()));
        }
        List<String> all = new ArrayList<>(names);
        for (String name : names) {
            all.add(name.toUpperCase(Locale.ROOT));
            all.add("./" + name);
            all.add(name + " ");
        }
        all.addAll(List.of("", "missing.bal", "Package.md", "Ballerina.toml", ".."));
        return all;
    }

    // The lookup findDocument used before: Project.documentId on <sourceRoot>/modules/<package>/<path>.
    private static Document legacyFindDocument(Package pkg, String path) {
        Project project = pkg.project();
        Path docPath = project.sourceRoot().resolve("modules").resolve(pkg.packageName().value()).resolve(path);
        try {
            DocumentId documentId = project.documentId(docPath);
            return pkg.getDefaultModule().document(documentId);
        } catch (RuntimeException ex) {
            return null;
        }
    }

    private static Package loadBala(Path path) {
        ProjectEnvironmentBuilder builder = ProjectEnvironmentBuilder.getDefaultBuilder();
        builder.addCompilationCacheFactory(TempDirCompilationCache::from);
        return BalaProject.loadProject(builder, path).currentPackage();
    }
}
