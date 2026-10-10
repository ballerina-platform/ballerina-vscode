# Function discovery and pagination

## Version authority

Imported public functions come from the active project's resolved compiler symbols, not a latest-version registry or an independently compiled dependency. Successful discovery is authoritative even when an imported module has no public functions. Symbol-discovery failure permits an index fallback only at a known, exact resolved version. An unresolved import without a known version cannot use latest-version results, including through a sibling module.

Version authority covers **every DEFAULT-scope resolved package**, including transitive dependencies. Adding a direct import of an already-resolved transitive package does not necessarily upgrade it. Function templates are obtained for a selected version, but generated imports contain only the organization and module name; offering another release's signature could therefore produce a call that the project cannot compile.

Central serves only each package's latest release, so its rows rarely match a resolved version once a newer release (even a patch) is published. A Central or index row for a resolved package at another version is therefore **rebased** onto the resolved version when the resolved package's own sources declare that public function, and dropped otherwise. A rebased row takes its description from the resolved sources too, and selecting it creates the node from the resolved version's signature, so a function added in a newer release is never offered. If the resolved package's sources cannot be read, the row is dropped. Functions present only in an older resolved release that Central no longer lists are not discovered through library search. Request-local catalogs avoid stale results after explicit dependency changes. Test-only dependencies do not establish production-version authority.

## Default views and offline behavior

The curated, popular-first function default view is replaced by independently paginated library discovery. Imported functions remain complete and separate from library page quotas. Registry discovery is Central-first, with an org-scoped SQLite fallback for an initial request that cannot reach Central. The offline fallback remains available, but no longer supplies the old curated popular-first ordering; index results are deterministically ordered and subject to the same version checks. A stale or empty index may provide few or no eligible library functions.

## Continuations and failures

Each library section has its own raw-source offset and source (`central` or `index`). Filtered rows and null slots still consume raw offsets. A short or empty visible batch may have more results, so clients must follow the returned continuation rather than treat the visible count as exhaustion.

A continuation cannot switch between Central and SQLite: their ordering differs. A failed Central continuation produces an LS error, not a successful empty page. Clients must recognize both rejected RPCs and resolved error-only LS responses, retain the cursor/source/results, and re-enable Load more for retry. The shared frontend controller implements this rule for the node panel and both helper browsers.

A first page has no source to keep yet. If Central fails at any point while that page is scanned, even after earlier windows succeeded, the rows already collected from Central are dropped and the whole page is rebuilt from the index, so the section's source becomes `index`. Mixing the two would leave a cursor that indexes neither source. If the index fails as well, the first page still returns the imported and workspace functions, with an empty library section that offers no Load more.

The bounded scan currently examines at most five 100-row windows per organization. A completely filtered batch can therefore advance the cursor without appending a visible function. Further scans require another explicit Load more click. Wall-clock budgets and parallel org fetching ([wso2/product-integrator#2724](https://github.com/wso2/product-integrator/issues/2724)), and a clearer empty-batch hint, are follow-up improvements, not implemented guarantees.

Only a first page lists imported functions. A Load more request collects only the resolved versions and imports that its filtering needs, and a workspace-only search (`limit` 0, used by the data mapper and agent tool pickers) collects neither.

## Client/server compatibility

Optional pagination metadata supports the **new client with an older language server**, using the legacy visible-page heuristic when metadata is absent. It does not guarantee the reverse: an older client's visible-count offsets may be incompatible with the newer server's raw offsets. The updated client and LS must ship together in the same VSIX; do not treat arbitrary old-client/new-LS combinations as supported.

## Regression coverage

- Compiler-derived full-surface invariants plus literal representative public function names cover imported discovery beyond former module/function caps.
- Workflow 0.10.0 acceptance uses the build-owned dependency home provisioned by Gradle and fails rather than silently skipping when that fixture is missing.
- An HTTP-only offline fixture verifies that promoting `time` from transitive to direct import retains its resolved version, that other-version rows are rebased only for functions the resolved release declares, and that the rebasing reads real transitive sources (`mime`).
- A fake-Central end-to-end test (`FunctionSearchCentralVersionTest`, ls-extension) serves newer releases (workflow 1.0.0, `time` 99.0.0) and verifies that imported functions stay at 0.10.0, transitive functions are rebased, latest-only APIs are hidden, and raw offsets still advance.
- Raw-page tests cover lookahead preservation, filtered/empty windows, source-pinned failure and retry.
- SQLite tests cover organization filtering in both FTS and LIKE branches, deterministic page tiling, and deduplication.
- Frontend controller, hook, and browser tests cover resolved/rejected failures, same-cursor retries, independent section loads, concurrent clicks, and stale responses.
