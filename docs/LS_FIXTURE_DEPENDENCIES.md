# LS Test Fixture Dependency Versions

The Ballerina package versions that **language-server test fixtures** compile
against — not the Java/Gradle dependencies of the language server itself, and not
the versions the shipped extension resolves.

For writing and debugging the tests themselves, see
[LS_TEST_GUIDE.md](LS_TEST_GUIDE.md). **All paths below are relative to
`packages/ballerina-language-server`.**

## The rule, and where it stops

**Declare fixture dependency versions in `build-config/ballerina_dependencies/`, and
never bump a `stdlib*Version` pin in `gradle.properties` just to make a test pass.**
Editing a pin for that reason has already caused a multi-commit regression.

But **the lock is not always what a fixture resolves**, so do not assume bumping it
is sufficient. A package can exist in *both* layers, and where it does, the
distribution copy wins (see below) — so fixtures can record the **injected** version
while the lock says something else. Check which situation you are in first:

```bash
# from packages/ballerina-language-server - is this package injected at all?
grep -n 'ballerinaStdLibs .*<package>-ballerina' build.gradle
```

No match means the lock is the only source and the procedure below is the whole job.
A match means both layers carry a version, and bumping the lock alone may change
nothing on the paths that resolve through the distribution.

### Worked example: `ballerina/ai`

This is the package behind the incident that prompted this document, and it is split
across both layers:

- `gradle.properties` — `stdlibAiVersion=1.11.2`, injected via
  `ballerinaStdLibs "io.ballerina.stdlib:ai-ballerina:${stdlibAiVersion}"`
- `build-config/ballerina_dependencies/Dependencies.toml` — `ballerina/ai` at `1.13.0`

Both versions are recorded in committed fixtures of the *same* module:
`agents_manager/config/agent_template_ballerina.json` expects `ballerina:ai:1.11.2`,
while siblings in that same directory (`agent_call_flow_node_8.json`,
`agent_call_flow_node_9.json`) expect `1.13.0`.

So neither layer owns `ai` uniformly. Bumping only the lock leaves the `1.11.2`
fixtures untouched, and bumping only the pin leaves the `1.13.0` ones untouched. When
a package is split like this, expect to touch both and to regenerate fixtures on both
sides — and read the diff to see which ones actually moved.

## How the two layers differ

| | `build-config/ballerina_dependencies/` | `gradle.properties` `stdlib*Version` |
|---|---|---|
| Purpose | provisions packages into the build-owned Ballerina home the test JVMs read | injects package `bala`s into each module's test distribution |
| Consumed by | `resolveBallerinaDependencies` → `build/ballerina_dependencies/home` | `ballerinaStdLibs` → `unpackStdLibs` → `copyStdlibs` → the module's extracted distribution |
| Change it to bump a fixture version? | **yes, start here** | only when the package is injected *and* fixtures record the injected version |

When the same package exists in both, the default test path resolves it from the
**distribution**: the Ballerina project API searches the `ballerina.home`
distribution repository before the build-owned Central cache in
`BALLERINA_HOME_DIR`. That is why an injected pin can override the version the lock
provisioned. Workspace layouts and custom repository configuration can change this
order, so treat it as the behaviour of the standard test setup rather than a
universal rule.

## Bumping an existing fixture dependency

1. Edit the `[[dependency]]` version in
   `build-config/ballerina_dependencies/Ballerina.toml`.
2. Regenerate the lock **through the Gradle task**, not by running `bal build` in the
   source directory. The task (`build.gradle`, `resolveBallerinaDependencies`) copies
   the project to `build/ballerina_dependencies`, points `BALLERINA_HOME_DIR` at the
   build-owned home, and runs `bal build --sticky` there. Running `bal build` in
   `build-config/` instead resolves against your machine-wide `~/.ballerina` — the
   exact thing the build-owned home exists to avoid — and leaves a `target/`
   directory behind.

   The task short-circuits on a hash of the **committed `Dependencies.toml`**, which
   your `Ballerina.toml` edit does not change, so clear the hash first or it logs
   `Dependencies.toml unchanged — skipping dependency resolution` and does nothing:

   ```bash
   # from packages/ballerina-language-server
   rm -rf build/ballerina_dependencies
   ./gradlew resolveBallerinaDependencies
   ```

3. Copy the regenerated lock back into the source tree:

   ```bash
   # from packages/ballerina-language-server
   cp build/ballerina_dependencies/Dependencies.toml build-config/ballerina_dependencies/
   ```

4. Commit `Ballerina.toml` and `Dependencies.toml` together.

Jar-conflict and `provided`-scope warnings in the resolution output are normal.
`lockingMode = "LOCKED"` in `Ballerina.toml` and `--sticky` on the build keep the
rest of the lock still, so only the package you named and whatever it drags with it
will move.

**Adding a new package** also needs an `import <org>/<pkg> as _;` line in
`build-config/ballerina_dependencies/main.bal` — the `[[dependency]]` entry only
constrains a version; the import is what makes it resolve and download.

## Always read the Dependencies.toml diff

If the lock moved a package you did **not** name, that package had to move so the
graph stays consistent. Those packages are part of your change, not noise.

For each one, find the expected outputs that refer to it and regenerate them
([LS_TEST_GUIDE.md § 3](LS_TEST_GUIDE.md#3-regenerating-expected-output)). Versions
are embedded literally, in three forms:

- `"version": "<version>"`
- `"packageInfo": "<org>:<pkg>:<version>"`
- icon URLs — `ballerina_<pkg>_<version>.png`

So grep for the **old** version before concluding nothing refers to it. From the
repository root:

```bash
# from the repository root; substitute the version you are replacing, dots escaped
OLD='<old-version>'                       # e.g. 2.16.5
grep -rn "_${OLD//./\\.}\|\"${OLD//./\\.}\"" --include='*.json' \
  packages/ballerina-language-server
```

Only the first two forms can actually fail a comparison — `icon` versions are
normalised away ([LS_TEST_GUIDE.md § 6](LS_TEST_GUIDE.md#6-debugging-a-failure)) —
but update all three so a later reader is not misled by a stale version in a
fixture.
