# Captured `search-symbols` response

`search-symbols-submodule.json` is a verbatim response from Ballerina Central's
`/2.0/registry/search-symbols`, kept so the Gson binding in `SymbolResponse` is asserted against real bytes rather
than against hand-built objects. Used by `CentralSearchUtilTest`.

Captured 2026-09-11 from `api.dev-central.ballerina.io` with
`q=submodulecheck&symbolType=function&limit=20`.

The sampled package declares `fromEdiString` in both its default module and its `mORDERS` submodule, and a
`getSchema` in the submodule alone. Every row carries the same package name, so the rows are separable only by
`moduleName` — which is what makes this a useful sample and what the registry fix for
wso2/product-integrator#2199 added.

This is a frozen sample, not a live dependency. Nothing here contacts the network, and the test keeps working if
the sampled package changes or disappears: only the response shape is under test, never its identity. Re-capture
with the URL above if the format changes, and update the date.

A response that omits `moduleName` entirely is not captured here. Every Central environment serves the field once
reindexed, so that shape is transitional rather than a second contract to maintain; the fallback it exercises is
covered by `testMissingModuleNameFallsBackToPackage`, which needs no payload.
