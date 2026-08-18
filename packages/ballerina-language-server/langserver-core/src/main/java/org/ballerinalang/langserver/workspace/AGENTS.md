## Service Boundaries

See [ARCHITECTURE.md](ARCHITECTURE.md) — Bounded Contexts table (`ARCHITECTURE.md:9-17`) and
Key Facts (`ARCHITECTURE.md:19-56`). Each Key Fact there is also the invariant to preserve and
cites the test that covers it — there's no separate invariants list here. Agent-specific
construction rules not covered there:

- Construct the facade via `WorkspaceManagerFacadeFactory.create(...)` — don't hand-wire
  `WorkspaceManagerFacadeImpl` outside tests.
- Per-request URI scoping goes through `forDocumentUri(String)` / `UriScopedWorkspaceManager` —
  not separate manager instances per scheme.

## Communication Patterns

See [ARCHITECTURE.md](ARCHITECTURE.md#communication-patterns) for the interaction table
(`ARCHITECTURE.md:60-68`).

## Verify Against

- Each Key Fact in ARCHITECTURE.md (`ARCHITECTURE.md:19-56`) cites the test that covers it —
  run that test after touching the behavior it describes.
- Acceptance tests: `langserver-core/src/test/java/.../workspace/test/acceptance/` — see
  [ARCHITECTURE.md#verification](ARCHITECTURE.md#verification) (`ARCHITECTURE.md:113-121`)
  for how they're structured.
- Unit tests sit alongside (e.g. `UriResolverTest`, `ProjectServiceTest`) — run the relevant
  one after touching its class.

