---
name: ballerina-ls-test-deps
description: Use when changing or adding the Ballerina package versions that language-server tests compile against - bumping a fixture dependency, editing build-config/ballerina_dependencies, or touching a stdlib*Version pin in gradle.properties.
---

# Ballerina LS Test Dependencies

Scope: `packages/ballerina-language-server`. This covers the versions that **test
fixtures** compile against — not the Java/Gradle dependencies of the LS itself.

## The one rule

**Fixture dependency versions live in `build-config/ballerina_dependencies/`.
Never change them by editing a `stdlib*Version` pin in `gradle.properties`.**

Those pins exist for a different job: injecting packages that ship in the full
Ballerina distribution but not in the minimal `jballerina-tools` distribution the
tests run on. They are not the version a fixture resolves. Editing one to make a
test pass has already caused one multi-commit regression (see the ai exception).

## How the two layers differ

| | `build-config/ballerina_dependencies/` | `gradle.properties` `stdlib*Version` |
|---|---|---|
| Purpose | provisions packages into the build-owned Ballerina home the test JVMs read | injects package `bala`s into each module's test distribution |
| Consumed by | `resolveBallerinaDependencies` → `build/ballerina_dependencies/home` | `ballerinaStdLibs` → `copyStdlibs` → `build/extracted-distribution/.../repo/bala` |
| Change it to bump a fixture version? | **yes, here** | **no** |

When the same version of a package exists in both, resolution prefers the
**distribution** copy. That is why an injected pin can silently override the
version the lock provisioned.

## Bumping an existing fixture dependency

1. Edit the `[[dependency]]` version in
   `build-config/ballerina_dependencies/Ballerina.toml`.
2. `cd` into `build-config/ballerina_dependencies` and run `bal build`. That
   regenerates `Dependencies.toml` in place.
3. Commit both files.

`lockingMode = "LOCKED"` and `sticky = true` keep the rest of the lock still, so
only the package you edited and whatever it drags with it will move.

**Adding a new package** additionally needs an `import <org>/<pkg> as _;` line in
`build-config/ballerina_dependencies/main.bal` — the `[[dependency]]` entry only
constrains a version, the import is what makes it resolve and download.

## Always read the Dependencies.toml diff

If the lock moved a package you did **not** name in `Ballerina.toml`, that package
had to move transitively so the whole graph stays consistent — the version you
bumped requires it. Those packages are part of your change, not noise.

For each one, find the tests that refer to it and update them too. Expected-output
fixtures embed versions literally, in two forms:

- `"version": "<version>"` fields
- icon URLs — `ballerina_<pkg>_<version>.png`

So grep for the **old** version string before concluding nothing refers to it:

```
grep -rn 'ballerina_workflow_0\.8\.0\|"0\.8\.0"' --include='*.json' \
  */modules/*/src/test/resources
```
