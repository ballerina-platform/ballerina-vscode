# Language Server Test Guide

How to write, extend, regenerate and debug the **JVM (Gradle/TestNG) tests** in
`packages/ballerina-language-server`. These start a real language server, call one
LSP method over it, and compare the JSON response against a checked-in expected
value.

> This is a different suite from the four levels in [TEST_GUIDE.md](TEST_GUIDE.md).
> Those are Jest/Playwright tests in the TypeScript packages; L3 there drives a
> *headless* LS from Node. This guide covers the Java tests that live inside the
> language-server package and run under Gradle.

> **Scope.** Work only inside `packages/ballerina-language-server`. Do not edit the
> `submodules/` tree. **All paths below are relative to that package.**

For the Ballerina package versions the test fixtures compile against, see
[LS_FIXTURE_DEPENDENCIES.md](LS_FIXTURE_DEPENDENCIES.md).

## 1. How an LS test is shaped

A test is **data-driven**: it does not declare its own cases. The base class walks a
config directory and feeds every `*.json` in it to a single `test(Path config)`
method, one TestNG invocation per file. A case is a file, not a method — the number
of tests a class reports is the number of `.json` files in its config directory.

```text
<module>/src/test/java/.../XyzTest.java          the test class - one per LSP method
<module>/src/test/resources/<resource_dir>/
    config/       one .json per case  <- the data provider walks this
    source/       .bal fixtures the cases point at
```

Two `AbstractLSTest` classes exist, and they are not the same shape:

| base class | used by | what it gives you |
|---|---|---|
| `io.ballerina.modelgenerator.commons.AbstractLSTest` | the model generators (flow, service, architecture, sequence, …) — the large majority of tests | LS lifecycle **plus** the config walker, `getResponse`, `updateConfig`, `compareJsonElements` |
| `org.ballerinalang.langserver.AbstractLSTest` | `langserver-core` | LS lifecycle and package mocking only; no config walker |

```bash
# every class extending a base directly (read its import to see which of the two)
grep -rnE 'class [A-Za-z0-9_]+ extends AbstractLSTest' --include='*.java' \
  packages/ballerina-language-server | grep -v '/build/'
```

Everything below describes the model-generator base. In `langserver-core`, extend
the feature-specific abstract test instead (`CompletionTest`,
`AbstractCodeActionTest`) — those declare their own `dataProvider()` and
`getTestResourceDir()`, still over a `config` directory.

If `config/` does not exist, `configDir` falls back to the resource dir itself.
Prefer the `config/` + `source/` split; it is what every current test uses.

## 2. Writing a new test

**Find the closest existing test and copy its shape.** One of the existing classes
almost certainly already calls a neighbouring API. Do not invent a new shape.

**Implement the four hooks.** The whole pattern, modelled on
`FindMatchingTypeTest`:

```java
public class FindMatchingTypeTest extends AbstractLSTest {

    @Override
    @Test(dataProvider = "data-provider")
    public void test(Path config) throws IOException {
        Path configJsonPath = configDir.resolve(config);
        TestConfig testConfig;
        try (BufferedReader reader = Files.newBufferedReader(configJsonPath)) {
            testConfig = gson.fromJson(reader, TestConfig.class);
        }
        FindTypeRequest request = new FindTypeRequest(getSourcePath(testConfig.filePath()),
                testConfig.typeMembers(), testConfig.expr());
        JsonObject response = getResponse(request);
        if (!response.equals(testConfig.output())) {
            TestConfig updateConfig = new TestConfig(testConfig.filePath(), testConfig.description(),
                    testConfig.typeMembers(), testConfig.expr(), response);
//            updateConfig(configJsonPath, updateConfig);      // see section 3
            compareJsonElements(response, testConfig.output());
            Assert.fail(String.format("Failed test: '%s' (%s)", testConfig.description(), configJsonPath));
        }
    }

    @Override protected String getResourceDir() { return "find_matching_type"; }   // dir under src/test/resources
    @Override protected Class<? extends AbstractLSTest> clazz() { return FindMatchingTypeTest.class; }
    @Override protected String getApiName() { return "findMatchingType"; }         // the LSP method
    @Override protected String getServiceName() { return "typesManager"; }         // defaults to "flowDesignService"
}
```

`getServiceName()` + `getApiName()` are joined into the request as
`<service>/<api>`, so only override `getServiceName()` when the API does not live
on `flowDesignService` — as this one does not.

**Define the config record.** A nested `record TestConfig(...)` whose components are
exactly the JSON keys. Include a `description` and **fill it in** — it is what the
failure message prints. Many existing configs leave it out, and their failures read
`Failed test: 'null' (…/config1.json)`, which tells the next reader nothing.

**Check how the module's `testng.xml` registers tests.** The test task runs
`useTestNG() { suites "src/test/resources/testng.xml" }`, and suites use one of two
mechanisms — sometimes both in the same file:

- an explicit `<class>` entry per test class, which is what most modules use:

  ```xml
  <class name="io.ballerina.flowmodelgenerator.extension.typesmanager.FindMatchingTypeTest"/>
  ```

- a `<packages>` block that picks up every class in a package. `langserver-core` is
  almost entirely package-based, and
  `flow-model-generator-ls-extension` covers several subpackages this way.

Read your target module's `testng.xml` before adding anything. In a suite that lists
classes explicitly, a class you forget to add **silently never runs**. In a
package-covered suite, a redundant `<class>` entry makes the class run twice.

```bash
grep -n '<packages>' -A20 <module>/src/test/resources/testng.xml
```

**Add the fixture** — a `.bal` under `source/`, and one `.json` per case under
`config/` with `"output": {}` for now. Then generate the expected value (section 3);
never hand-write it.

**Run just your class:**

```bash
./gradlew :flow-model-generator:flow-model-generator-ls-extension:test \
    --tests "io.ballerina.flowmodelgenerator.extension.typesmanager.FindMatchingTypeTest"
```

## 3. Regenerating expected output

The write-back is committed **commented out**, and you uncomment it temporarily:

```java
//            updateConfig(configJsonPath, updateConfig);
```

1. Uncomment it.
2. Run the class. **This run still fails.** The write sits inside the mismatch
   branch: the comparison has already been made against the old in-memory
   `testConfig.output()`, and `Assert.fail` follows the write. The new expectation
   only takes effect on the next run.
3. **Read the diff.** This is the review step — the question is whether the
   server's new response is correct. `updateConfig` writes the repo's committed JSON
   formatting, so the diff is only the semantic change.
4. Re-run to confirm green.
5. Re-comment before committing.

**Never commit a live `updateConfig`.** Because the write is unconditional inside the
mismatch branch, the *next* run passes against whatever the server returned. The
test goes red once and green forever after, absorbing any later regression.

Some call sites are currently live, so do not treat an uncommented one you find as
precedent:

```bash
# live call sites: the call at the start of a line, so neither the commented-out
# form (//  updateConfig(...)) nor the method declaration matches
grep -rnE '^[[:space:]]*updateConfig\(' --include='*.java' \
  packages/ballerina-language-server | grep -v '/build/'
```

## 4. Adding a case to a test that already exists

Drop another `.json` into that `config/` directory. **There is nothing to register**
— the data provider takes every file that ends in `.json` and does not start with
`.`. Reuse an existing `source/` fixture when the scenario allows.

## 5. Skipping a case

`skipList()` returns config **filenames**, which the data provider filters out:

```java
@Override
protected String[] skipList() {
    return new String[]{"salesforce_service_model_2.json"};
}
```

Always document the reason in the javadoc above it, one paragraph per entry, with a
tracking link. A skip with no explanation is indistinguishable from an accident —
copy the format in `GetServiceInitModelTest`.

## 6. Debugging a failure

`compareJsonElements` writes the diff to the test's **stderr** (slf4j → JUL).
`gradle/javaProject.gradle` sets `showStandardStreams = true` for every module that
applies it, so the diff normally appears on the console alongside the assertion. If
it does not, read it out of the results XML of a run that has already finished:

```bash
grep -o "Value mismatch at '[^']*'" \
  flow-model-generator/modules/flow-model-generator-ls-extension/build/test-results/test/TEST-*FindMatchingTypeTest.xml
```

`compareJsonElements` reports **every** difference, not just the first, in three
shapes — `Value mismatch at '<path>'` with actual/expected, `Key '<path>' is
missing in the expected/actual JSON`, and `Extra element in actual JSON at
'<path>[i]'`. The paths are dotted with array indices
(`recordConfig.fields[0].typeName`), which usually names the cause outright.

Two paths are normalised before comparison, so differences there never surface:
`filePath` values have `\` folded to `/`, and `icon` URLs have the trailing
`_<version>.png` stripped. A version drift shows up as a `"version"` or
`"packageInfo"` mismatch, not as an icon mismatch.

- **A version string in the diff** means a dependency moved. Go to
  [LS_FIXTURE_DEPENDENCIES.md](LS_FIXTURE_DEPENDENCIES.md).
- **`Failed to initialize the compiler plugin in package: ... "ctxData" is null`**
  is a known flaky compiler-plugin initialisation failure, not your change. It moves
  between tests run to run. Re-run the class alone before investigating.
- **`failed to connect to the docker API at unix:///var/run/docker.sock`** is
  harmless noise; it prints on fully passing runs too.
- **A golden that passes locally but fails on CI** usually means the local run was
  green off a stale distribution. Each module's `copyStdlibs` copies into its test
  distribution without deleting first, so old package versions accumulate. The
  directory name is not the same in every module — most use
  `build/extracted-distribution/jballerina-tools-<ver>`, `misc/diagram-util` uses
  `build/jballerina-tools-<ver>`, and `misc/ballerinalang-data-mapper` uses
  `extracted-distributions` (plural). Match on the name rather than one path:

  ```bash
  find . -type d \( -name 'extracted-distribution*' -o -name 'jballerina-tools-*' \) -prune -print
  ```

  Delete those directories plus `build/ballerina_dependencies`, then re-run the
  class — the next build re-extracts and re-provisions both.

- **Avoid running two Gradle builds against this project at once.** These tasks
  write into shared, non-versioned build state (each module's test distribution and
  the root `build/ballerina_dependencies` home), so one build can extract over a
  distribution another build is reading.

## 7. Tests must not reach Ballerina Central

Every `Test` task in every module gets `-Dls.test.offline=true` and
`BALLERINA_HOME_DIR` pointed at the build-owned Ballerina home
(`rootProject.ballerinaTestHomeDir`), and depends on `resolveBallerinaDependencies`
to populate it first (`build.gradle`, `allprojects` block).

Three places read that property:

| symbol | role |
|---|---|
| `CommonUtil.TEST_OFFLINE` (`langserver-core`) | reads the system property; the flag everything else defers to |
| `PackageUtil.isOffline()` (`model-generator-commons`) | delegates to `CommonUtil.TEST_OFFLINE`; use this from resolution code |
| `RemoteCentral.OFFLINE` (`flow-model-central-client`) | makes `RemoteCentral.getInstance()` hand back an `OfflineCentral` that refuses every call |

If you add a resolution path, go through `PackageUtil`. Do not read the property
yourself and do not construct a `CentralAPIClient` directly.

To check a run stayed offline: the home is provisioned from a lock with exactly one
version per package, so a second version can only have been downloaded.

```bash
H=build/ballerina_dependencies/home/repositories/central.ballerina.io/bala
for pkg in "$H"/*/*; do
  [ "$(ls "$pkg" | wc -l)" -gt 1 ] && echo "PULLED: $pkg -> $(ls "$pkg" | tr '\n' ' ')"
done
```

No output means no package has more than one version.
