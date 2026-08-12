---
name: ballerina-ls-test-writer
description: Use when adding, changing or debugging a language-server unit test in packages/ballerina-language-server - writing a new AbstractLSTest case, creating or regenerating a config/source fixture, working out why a golden mismatches, or changing the Ballerina package versions the fixtures compile against.
---

# Ballerina LS Test Writer

Scope: `packages/ballerina-language-server`. These are JVM tests that drive a real
language server over LSP and compare its JSON response against a checked-in
expected value.

For anything about the Ballerina package versions fixtures compile against, jump
to [Fixture dependency versions](#fixture-dependency-versions). That is a
self-contained sub-topic with its own rules.

## How an LS test is shaped

Almost every test extends `AbstractLSTest` and is **data-driven**: it does not
declare its own cases. The base class walks a config directory and feeds every
`*.json` file in it to a single `test(Path config)` method.

```
<module>/src/test/java/.../XyzTest.java              the test class
<module>/src/test/resources/<resource_dir>/
    config/       one .json per case  <- the data provider reads this
    source/       .bal fixtures the cases point at
```

There are two copies of `AbstractLSTest`. Extend the one your module already
uses:

| module | base class |
|---|---|
| model generators (flow, service, architecture, sequence, ...) | `io.ballerina.modelgenerator.commons.AbstractLSTest` |
| `langserver-core` | `org.ballerinalang.langserver.AbstractLSTest` |

## Writing a new test

**1. Find the closest existing test and copy its shape.** 169 classes extend
`AbstractLSTest`; one of them almost certainly already calls the API you care
about. Do not invent a new shape.

**2. Implement the four hooks.**

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
            TestConfig updated = new TestConfig(testConfig.filePath(), testConfig.description(),
                    testConfig.typeMembers(), testConfig.expr(), response);
//          updateConfig(configJsonPath, updated);          // see "Regenerating a golden"
            compareJsonElements(response, testConfig.output());
            Assert.fail(String.format("Failed test: '%s' (%s)", testConfig.description(), configJsonPath));
        }
    }

    @Override protected String getResourceDir() { return "find_matching_type"; }   // dir under src/test/resources
    @Override protected Class<? extends AbstractLSTest> clazz() { return FindMatchingTypeTest.class; }
    @Override protected String getApiName() { return "findMatchingType"; }         // the LSP method
    // getServiceName() defaults to "flowDesignService" - override for another service
}
```

**3. Define the config record.** A nested `record TestConfig(...)` whose fields
are exactly the JSON keys. Give it a `description` field and fill it in — it is
what the failure message prints, so it is the only thing a future reader sees
first.

**4. Add the fixture.** A `.bal` file under `source/`, and one `.json` per case
under `config/` whose `output` you leave as `{}` initially.

**5. Generate the expected output** — see below. Never hand-write it.

**6. Run just your class:**

```bash
./gradlew :flow-model-generator:flow-model-generator-ls-extension:test \
    --tests "io.ballerina.flowmodelgenerator.extension.typesmanager.FindMatchingTypeTest"
```

## Regenerating a golden

The committed code keeps the write-back **commented out**, and you uncomment it
temporarily:

```java
//          updateConfig(configJsonPath, updated);
```

1. Uncomment it.
2. Run the test. It writes the actual response into the config's `output`.
3. **Read the diff.** This is the actual review step — you are approving the
   response as correct, not just making a test green.
4. Re-comment it before committing.

**A live `updateConfig` call can never fail.** It sits inside the mismatch
branch, so leaving it uncommented makes the test rewrite its own expectation on
every run and assert nothing. 158 call sites are correctly commented; 10 are
currently live, so do not treat an uncommented one you find as precedent.

## Adding a case to a test that already exists

Drop another `.json` into that `config/` directory. There is no list to
register it in — the data provider picks up every `.json` that does not start
with `.`. Reuse an existing `source/` fixture when the scenario allows.

## Skipping a case

`skipList()` returns config **filenames**, and the data provider filters them
out:

```java
@Override
protected String[] skipList() {
    return new String[]{"salesforce_service_model_2.json"};
}
```

Always attach the reason and a link in the javadoc above it. A skip with no
explanation is indistinguishable from an accident — see
`GetServiceInitModelTest` for the format to follow.

## Debugging a failure

`compareJsonElements` prints the first differing path, which is usually enough.
Beyond that:

- **A version string in the diff** means a dependency moved. Go to
  [Fixture dependency versions](#fixture-dependency-versions).
- **`Failed to initialize the compiler plugin in package: ... "ctxData" is null`**
  is a known flaky compiler-plugin initialisation failure, not your change. It
  moves between tests run to run. Re-run the class alone before investigating.
- **A golden that only fails on CI** usually means it was passing locally off a
  stale `build/extracted-distribution`. `copyStdlibs` copies into that directory
  without deleting, so old package versions accumulate. Wipe it and re-run:

  ```bash
  cd packages/ballerina-language-server
  find . -type d -name extracted-distribution -o -type d -name 'jballerina-tools-*' | xargs rm -rf
  rm -rf build/ballerina_dependencies
  ```

- **Never run two Gradle builds against this project at once**, and do not edit
  sources while a suite is running. Both silently corrupt the result.

## Tests must not reach the network

Test JVMs get `-Dls.test.offline=true` and `BALLERINA_HOME_DIR` pointed at a
build-owned Ballerina home. The server installs an offline package resolver, so
resolution comes only from that home.

If you add a resolution path, go through `PackageUtil` — do not branch on
offline-ness yourself, and do not construct a `CentralAPIClient` directly.

To check a run stayed offline, the home is provisioned from a lock file with
exactly one version per package, so a second version can only come from a
download:

```bash
H=build/ballerina_dependencies/home/repositories/central.ballerina.io/bala
for pkg in "$H"/*/*; do
  [ "$(ls "$pkg" | wc -l)" -gt 1 ] && echo "PULLED: $pkg -> $(ls "$pkg" | tr '\n' ' ')"
done
```

## Fixture dependency versions

This covers the versions **test fixtures** compile against — not the
Java/Gradle dependencies of the LS itself.

### The one rule

**Fixture dependency versions live in `build-config/ballerina_dependencies/`.
Never change them by editing a `stdlib*Version` pin in `gradle.properties`.**

Those pins do a different job: injecting packages that ship in the full
Ballerina distribution but not in the minimal `jballerina-tools` distribution
the tests run on. They are not the version a fixture resolves. Editing one to
make a test pass has already caused a multi-commit regression.

### How the two layers differ

| | `build-config/ballerina_dependencies/` | `gradle.properties` `stdlib*Version` |
|---|---|---|
| Purpose | provisions packages into the build-owned Ballerina home the test JVMs read | injects package `bala`s into each module's test distribution |
| Consumed by | `resolveBallerinaDependencies` → `build/ballerina_dependencies/home` | `ballerinaStdLibs` → `copyStdlibs` → `build/extracted-distribution/.../repo/bala` |
| Change it to bump a fixture version? | **yes, here** | **no** |

When the same package exists in both, resolution prefers the **distribution**
copy. That is why an injected pin can silently override the version the lock
provisioned.

### Bumping an existing fixture dependency

1. Edit the `[[dependency]]` version in
   `build-config/ballerina_dependencies/Ballerina.toml`.
2. `cd build-config/ballerina_dependencies && bal build`. That regenerates
   `Dependencies.toml` in place.
3. Commit both files.

`lockingMode = "LOCKED"` and `sticky = true` keep the rest of the lock still, so
only the package you edited and whatever it drags with it will move.

**Adding a new package** also needs an `import <org>/<pkg> as _;` line in
`build-config/ballerina_dependencies/main.bal` — the `[[dependency]]` entry only
constrains a version; the import is what makes it resolve and download.

### Always read the Dependencies.toml diff

If the lock moved a package you did **not** name, that package had to move so
the graph stays consistent. Those packages are part of your change, not noise.

For each one, find the tests that refer to it and update them too. Expected
outputs embed versions literally, in two forms:

- `"version": "<version>"` fields, and `"packageInfo": "<org>:<pkg>:<version>"`
- icon URLs — `ballerina_<pkg>_<version>.png`

So grep for the **old** version string before concluding nothing refers to it:

```bash
grep -rn 'ballerina_workflow_0\.8\.0\|"0\.8\.0"' --include='*.json' \
  */modules/*/src/test/resources
```
