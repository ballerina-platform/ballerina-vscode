Test-only package for the language server's fast-run tests, installed into the test home's local repository by
`langserver-core`'s test task. Its compiler plugin's code modifier replaces `__FAST_RUN_MARKER__` with
`code modifier` in the sources of any package that imports it, and fails on `__FAST_RUN_PLUGIN_FAILURE__`. It rewrites `__FAST_RUN_ANALYZER_FAILURE__` too, and its code
analyzer fails on the rewritten form, so the analyzer fails only once the modifier has run.
