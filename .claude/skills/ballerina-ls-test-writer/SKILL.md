---
name: ballerina-ls-test-writer
description: Use when adding, changing or debugging a language-server unit test in packages/ballerina-language-server - writing a new AbstractLSTest case, creating or regenerating a config/source fixture, working out why a golden mismatches, or changing the Ballerina package versions the fixtures compile against.
---

# Ballerina LS Test Writer

These are JVM tests that start a real language server, call one LSP method over it,
and compare the JSON response against a checked-in expected value.

> Scope: work only inside `packages/ballerina-language-server`. Do **not** edit the
> `submodules/` tree. All paths below are relative to that package.

Changing the Ballerina package versions fixtures compile against is a
self-contained sub-topic with its own rules — jump to
[Fixture dependency versions](#fixture-dependency-versions).

## 1. How an LS test is shaped

A test is **data-driven**: it does not declare its own cases. The base class walks a
config directory and feeds every `*.json` in it to a single `test(Path config)`
method, one TestNG invocation per file.

```
<module>/src/test/java/.../XyzTest.java          the test class - one per LSP method
<module>/src/test/resources/<resource_dir>/
    config/       one .json per case  <- the data provider walks this
    source/       .bal fixtures the cases point at
```

`find_matching_type/config/` holds 11 `.json` files, and the class reports 11 tests.
That ratio is the whole model: **a case is a file, not a method.**

Two `AbstractLSTest` classes exist, and they are not the same shape. 169 classes
extend one of them directly:

| base class | used by | what it gives you |
|---|---|---|
| `io.ballerina.modelgenerator.commons.AbstractLSTest` | the model generators (flow, service, architecture, sequence, …) — 164 classes | LS lifecycle **plus** the config walker, `getResponse`, `updateConfig`, `compareJsonElements` |
| `org.ballerinalang.langserver.AbstractLSTest` | `langserver-core` — 5 classes | LS lifecycle and package mocking only; no config walker |

Everything below describes the model-generator base. In `langserver-core`, extend
the feature-specific abstract test instead (`CompletionTest`,
`AbstractCodeActionTest`) — those declare their own `dataProvider()` and
`getTestResourceDir()`, still over a `config` directory.

If `config/` does not exist, `configDir` falls back to the resource dir itself.
Prefer the `config/` + `source/` split; it is what every current test uses.

## 2. Writing a new test

**Find the closest existing test and copy its shape.** With 169 classes, one of
them almost certainly already calls a neighbouring API. Do not invent a new shape.

**Implement the four hooks.** `FindMatchingTypeTest` is the whole pattern in 40
lines:

```java
public class FindMatchingTypeTest extends AbstractLSTest {

    @Override
    @Test(dataProvider = "data-provider")
    public void test(Path config) throws IOException {
        Path configJsonPath = configDir.resolve(config);
        TestConfig testConfig = gson.fromJson(Files.newBufferedReader(configJsonPath), TestConfig.class);
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

**Register the class in the module's `testng.xml`.** The test task runs
`useTestNG() { suites "src/test/resources/testng.xml" }`, so a class that is not
listed there silently never runs:

```xml
<class name="io.ballerina.flowmodelgenerator.extension.typesmanager.FindMatchingTypeTest"/>
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
2. Run the class. **This run still fails** — the write happens inside the mismatch
   branch and `Assert.fail` follows it. That is expected.
3. **Read the diff.** This is the actual review step: you are approving the server's
   response as correct, not making a test green. `updateConfig` writes the repo's
   committed JSON formatting, so the diff is only the semantic change.
4. Re-run to confirm green.
5. Re-comment before committing.

**Never commit a live `updateConfig`.** It does not silence the failing run — it
destroys the expectation, so the *next* run passes unconditionally against whatever
the server just returned. The test goes red once and green forever after, absorbing
any regression from then on. 160 call sites are correctly commented; 10 are
currently live, so do not treat an uncommented one you find as precedent.

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

The console shows only the assertion. **The diff goes to the test's stderr**, so
either re-run with `-i`:

```bash
./gradlew :flow-model-generator:flow-model-generator-ls-extension:test \
    --tests "io.ballerina.flowmodelgenerator.extension.typesmanager.FindMatchingTypeTest" -i
```

or read it out of the report afterwards:

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
  [Fixture dependency versions](#fixture-dependency-versions).
- **`Failed to initialize the compiler plugin in package: ... "ctxData" is null`**
  is a known flaky compiler-plugin initialisation failure, not your change. It moves
  between tests run to run. Re-run the class alone before investigating.
- **`failed to connect to the docker API at unix:///var/run/docker.sock`** is
  harmless noise; it prints on fully passing runs too.
- **A golden that passes locally but fails on CI** usually means the local run was
  green off a stale distribution. `copyStdlibs` copies into
  `build/extracted-distribution` without deleting, so old package versions
  accumulate there. List what you have, then wipe and re-run:

  ```bash
  find . -type d \( -name extracted-distribution -o -name 'jballerina-tools-*' \) -prune -print
  ```

  Delete those directories plus `build/ballerina_dependencies`, then re-run the
  class — the next build re-extracts and re-provisions both.

- **Never run two Gradle builds against this project at once**, and do not edit
  sources while a suite is running. Both silently corrupt the result.

## 7. Tests must not reach Ballerina Central

Every `Test` task in every module gets `-Dls.test.offline=true` and
`BALLERINA_HOME_DIR` pointed at the build-owned Ballerina home, and depends on
`resolveBallerinaDependencies` to populate it first (`build.gradle`, `allprojects`
block). `PackageUtil.FORCE_OFFLINE` and `RemoteCentral.getInstance()` read that
property; the latter returns an `OfflineCentral` that refuses every call.

If you add a resolution path, go through `PackageUtil`. Do not branch on
offline-ness yourself and do not construct a `CentralAPIClient` directly.

To check a run stayed offline: the home is provisioned from a lock with exactly one
version per package, so a second version can only have been downloaded.

```bash
H=build/ballerina_dependencies/home/repositories/central.ballerina.io/bala
for pkg in "$H"/*/*; do
  [ "$(ls "$pkg" | wc -l)" -gt 1 ] && echo "PULLED: $pkg -> $(ls "$pkg" | tr '\n' ' ')"
done
```

Silence means clean.

## Fixture dependency versions

This covers the versions **test fixtures** compile against — not the Java/Gradle
dependencies of the LS itself.

### The one rule

**Fixture dependency versions live in `build-config/ballerina_dependencies/`. Never
change them by editing a `stdlib*Version` pin in `gradle.properties`.**

Those 29 pins do a different job: injecting packages that ship in the full Ballerina
distribution but not in the minimal `jballerina-tools` distribution the tests run
on. They are not the version a fixture resolves. Editing one to make a test pass has
already caused a multi-commit regression.

### How the two layers differ

| | `build-config/ballerina_dependencies/` | `gradle.properties` `stdlib*Version` |
|---|---|---|
| Purpose | provisions packages into the build-owned Ballerina home the test JVMs read | injects package `bala`s into each module's test distribution |
| Consumed by | `resolveBallerinaDependencies` → `build/ballerina_dependencies/home` | `ballerinaStdLibs` → `copyStdlibs` → `build/extracted-distribution/jballerina-tools-<ver>/repo/bala` |
| Change it to bump a fixture version? | **yes, here** | **no** |

When the same package exists in both, resolution prefers the **distribution** copy.
That is why an injected pin can silently override the version the lock provisioned.

### Bumping an existing fixture dependency

1. Edit the `[[dependency]]` version in
   `build-config/ballerina_dependencies/Ballerina.toml`.
2. Regenerate the lock in place:

   ```bash
   cd build-config/ballerina_dependencies && bal build
   ```

   Jar-conflict and `provided`-scope warnings in that output are normal.
3. Commit `Ballerina.toml` and `Dependencies.toml` together.

`lockingMode = "LOCKED"` and `sticky = true` keep the rest of the lock still, so
only the package you named and whatever it drags with it will move.

**Adding a new package** also needs an `import <org>/<pkg> as _;` line in
`build-config/ballerina_dependencies/main.bal` — the `[[dependency]]` entry only
constrains a version; the import is what makes it resolve and download.

### Always read the Dependencies.toml diff

If the lock moved a package you did **not** name, that package had to move so the
graph stays consistent. Those packages are part of your change, not noise.

For each one, find the expected outputs that refer to it and regenerate them.
Versions are embedded literally, in three forms:

- `"version": "<version>"`
- `"packageInfo": "<org>:<pkg>:<version>"`
- icon URLs — `ballerina_<pkg>_<version>.png`

So grep for the **old** version before concluding nothing refers to it:

```bash
grep -rn 'ballerina_http_2\.16\.3\|"2\.16\.3"' --include='*.json' \
  */modules/*/src/test/resources
```

Only the first two forms can actually fail a comparison — `icon` versions are
normalised away (section 6) — but update all three so the fixtures stay honest.
