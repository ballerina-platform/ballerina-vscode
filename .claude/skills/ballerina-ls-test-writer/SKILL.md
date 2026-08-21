---
name: ballerina-ls-test-writer
description: Use when adding, changing or debugging a language-server unit test in packages/ballerina-language-server - writing a new AbstractLSTest case, creating or regenerating a config/source fixture, working out why a golden mismatches, or changing the Ballerina package versions the fixtures compile against.
---

# Ballerina LS Test Writer

The JVM (Gradle/TestNG) tests in `packages/ballerina-language-server`. Each starts a
real language server, calls one LSP method, and compares the JSON response against a
checked-in expected value.

**Read the guide before writing anything:**

- [`docs/LS_TEST_GUIDE.md`](../../../docs/LS_TEST_GUIDE.md) — how a test is shaped,
  writing a new one, regenerating a golden, adding/skipping a case, debugging a
  failure, and the offline guarantee.
- [`docs/LS_FIXTURE_DEPENDENCIES.md`](../../../docs/LS_FIXTURE_DEPENDENCIES.md) —
  changing the Ballerina package versions the fixtures compile against.

> Scope: work only inside `packages/ballerina-language-server`. Do **not** edit the
> `submodules/` tree.

## Non-negotiables

These are the ones that are easy to get wrong and expensive to catch in review.

1. **A case is a file, not a method.** Tests are data-driven over a `config/`
   directory. To add a case, add a `.json` — do not write a new `@Test` method.

2. **Never hand-write an expected value.** Generate it by temporarily uncommenting
   the `updateConfig(configJsonPath, ...)` call, then **read the diff** and decide
   whether the server's response is correct.

3. **Never leave `updateConfig` uncommented.** It writes unconditionally inside the
   mismatch branch, so the next run passes against whatever the server returned and
   the test can never fail again. Some existing call sites are live — that is a known
   defect, not precedent. Re-comment before committing.

4. **Never change a `stdlib*Version` pin in `gradle.properties` to fix a test.**
   Fixture versions are owned by `build-config/ballerina_dependencies/`. Editing a
   pin instead has already caused a multi-commit regression.

5. **Check the module's `testng.xml` before adding an entry.** Some suites register
   classes explicitly, some by `<packages>` wildcard, some both. A missing entry
   means the class silently never runs; a redundant one runs it twice.

6. **Tests must never reach Ballerina Central.** Route new resolution through
   `PackageUtil`; do not read `ls.test.offline` yourself or construct a
   `CentralAPIClient`.

7. **Do not report a green run you did not see.** State the exact Gradle command and
   its result.

## Before you finish

- `updateConfig` re-commented.
- `description` filled in on every new config (the failure message prints it).
- Any `skipList()` entry has a javadoc reason and a tracking link.
- If a version moved, the `Dependencies.toml` diff was read and every fixture
  referring to a changed package was regenerated.
