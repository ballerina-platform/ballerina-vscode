# Java language server tests

Guide section: `docs/TEST_GUIDE.md` → "Language server tests (Java)".

## Decide

Three kinds of test, in order of preference:

1. **A JSON config for an existing test class** — most changes to an existing API.
   Add the config (and a `.bal` source if no existing one fits) to the class's resource
   directory. Find the class by its `getApiName()` value. If several classes match,
   pick the one in the module that changed, and skip classes marked
   `@Test(enabled = false)`. If the class lists its configs in `getConfigsList()`
   instead of discovering them, add the new config to that list.
2. **A new `AbstractLSTest` class** — a new API, with its own resource directory.
3. **A plain TestNG test** — when one request per config cannot show the defect:
   state carried between requests (a static cache), concurrency (a lock), or a utility
   class with no LS API (for example `ProjectLocks`). Put it in the module that owns
   the code, under `src/test/java`.

Before adding a class, read the module's `src/test/resources/testng.xml`. Suites that
list classes need a `<class>` entry, or the class never runs. Suites that include the
class's package with `<package>` need no entry; adding one runs the class twice.

## Write

- The config holds the input (source file, position, code data), a `description`,
  and the expected response. Fill in `description`: the failure message prints it.
  Name the file after the case, and `issue-<n>.json` for a bug fix with an issue number.
- A skipped case needs a javadoc paragraph above `skipList()` with the reason and a
  tracking link.
- Do not change a `stdlib*Version` pin in `gradle.properties` to make a test pass.
  Fixture package versions are moved in `build-config/ballerina_dependencies/`; follow
  "Fixture dependency versions" in the guide, and regenerate every config that refers
  to a package whose version moved in `Dependencies.toml`.
- New code that resolves packages goes through `PackageUtil`, so tests stay offline.
  Do not read `ls.test.offline` directly or construct a `CentralAPIClient`.
- To fill in the expected response, uncomment the `updateConfig(...)` call in the test,
  run it once (that run still fails; the next one uses the new value), then comment it
  out again. Never commit a test with the call active: the
  test then rewrites its expected output on every failure.
- The generated expected response is the current behaviour, not the correct one. Read
  the JSON diff and check every value against the intended behaviour before keeping it.
  For a bug fix, the revert check in `SKILL.md` step 5 must fail on the fixed value.

## Run

```bash
cd packages/ballerina-language-server
./gradlew :<module-path>:test --tests '*<TestClass>' -PskipCoverage
```

`<module-path>` is the project path from `settings.gradle`, for example
`flow-model-generator:flow-model-generator-ls-extension`. Needs Java 21. Gradle unpacks
the Ballerina distribution itself. For a failure, see "Debugging a failure" in the guide.
