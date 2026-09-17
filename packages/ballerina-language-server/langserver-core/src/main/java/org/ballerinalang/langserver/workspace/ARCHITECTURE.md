
Owns project lifecycle, document state, compilation, execution, and observability for the
Ballerina Language Server. Organized as bounded contexts under one package tree
(`org.ballerinalang.langserver.workspace`), fronted by `WorkspaceManagerFacadeImpl`, which
implements the public `WorkspaceManager` interface (`langserver-commons`).

## Bounded Contexts

| Context | Package | Responsibility |
|---|---|---|
| **Facade** | `workspace` (top level) | Implements `WorkspaceManager`; delegates to services |
| **Workspace Manager** | `workspace.workspacemanager.*` | Project lifecycle, URI resolution, change buffering |
| **Compiler Engine** | `workspace.compilerengine.*` | Compilation pipeline, dual snapshot store, circuit breaker |
| **Execution Manager** | `workspace.executionmanager`, `workspace.execution` | `bal run` child-process lifecycle |
| **Observability** | `workspace.observability` | Trace/metric emission |
| **Resource Monitor** | `workspace.resourcemonitor` | Heap pressure detection |
| **Event Bus** (shared kernel) | `workspace.eventbus.*` | Tiered sync pub/sub |

## Key Facts

Each fact below is also an invariant: don't change the described behavior without updating
this doc and the test cited with it.

- **`WorkspaceManager` interface** (`langserver-commons`): **25 methods**, not annotated
  as frozen — treat as stable; changing a signature means updating every implementor
  (`WorkspaceManagerFacadeImpl`, `UriScopedWorkspaceManager`, `BallerinaWorkspaceManager`,
  `TestWorkspaceManager`) and repo-wide callers.
- **URI schemes:** `file` (+ `bala`, normalized to `file`), `expr`, `ai`. `untitled` unhandled.
  All handled directly by `WorkspaceManagerFacadeImpl` — no per-scheme manager instances.
- **`BallerinaWorkspaceManagerProxyImpl`** (`@Deprecated(forRemoval=true)`): a scheme-routing
  proxy with **zero callers**. Don't resurrect it; per-scheme scoping goes through
  `forDocumentUri(String)` / `UriScopedWorkspaceManager`.
- **`UriResolver`** is the project index: lock-free trie + Guava-cache-backed bounded index
  (`DocumentUri -> ResolvedEntry`). Bound is a constructor param (unbounded if omitted);
  production wiring in `ProjectServiceImpl` uses `DEFAULT_MAX_PROJECTS = 128` — keep it bounded
  there (pass `maxProjects` + eviction callback, don't switch to the unbounded no-arg ctor).
  → `UriResolverTest`, `TrieNodeTest`, `ThreadSafetyTest`
- **`ChangeBuffer`:** holds `BufferedChange` deltas per `DocumentUri` per `ChangeLayer`
  (`EDITOR`/`AI`/`EXPR`) — never file content. Read resolved content through the compiler's
  `Document`/`Project`, not `Files.readString()` or similar direct I/O. `EDITOR` layer presence
  = open/closed signal. → `ChangeBufferAcceptanceTest`
- **`DualSnapshotStore`:** default max **16** stable snapshots (`DEFAULT_MAX_STABLE_SNAPSHOTS`),
  LRU eviction. Eviction clears only the stable snapshot's symbol graph — never the
  in-progress slot or pipeline registration. → `DualSnapshotAcceptanceTest`
- **Heap pressure** (`HeapPressureLevel`): `NORMAL→WARNING(≥70%)→CRITICAL(≥80%)→EMERGENCY(≥90%)`,
  10-point hysteresis, event fires only on level transitions.
- **Event bus tiers** (`SubscriberTier`): `CRITICAL`, `COALESCEABLE`, `BEST_EFFORT` —
  per-subscriber isolated delivery; a slow/failing subscriber in one tier must not block
  another. → `EventBusBackpressureTest`
- **Cancellation:** cooperative — cancellation flag + `Thread.interrupt()` on the compile
  worker thread, not thread kill. Compilation never runs on the request thread. →
  `CancellationModelTest`, `AsyncCompilationPipelineTest`

## Communication Patterns

| Interaction | Pattern |
|---|---|
| LSP handler → facade | Sync call on `WorkspaceManagerFacadeImpl` |
| Facade → services | Sync delegation to `ProjectService`/`CompilationService`/`ExecutionService` |
| Context → context | Typed `DomainEvent` via `EventSyncPubSubHolder` |
| Snapshot reads | `DualSnapshotStore.getStable(key)`, or await in-progress `CompletableFuture` |
| Document change | `didChange`/watcher → `ChangeBuffer` enqueue → `ChangeApplier` drains → compiler project |
| URI resolution | `UriResolver` trie + bounded cache |
| Heap pressure | `HeapPressureMonitor` polls `MemoryPoolMXBean` → publishes `HeapPressureDetected` |

Single JVM process — no RPC, no HTTP, no message broker.

## Folder Structure

```text
langserver-commons/.../commons/workspace/
├── WorkspaceManager.java              # public interface, 25 methods
├── WorkspaceManagerProxy.java
├── UnifiedWorkspaceManagerProxy.java
├── UriScopedWorkspaceManagerProvider.java
├── WorkspaceDocumentManager.java
├── WorkspaceDocumentException.java
├── LSDocumentIdentifier.java
├── RunContext.java
└── RunResult.java

langserver-core/.../workspace/
├── WorkspaceManagerFacadeImpl.java        # live implementation
├── WorkspaceManagerFacadeFactory.java     # constructs a wired facade
├── WiringConfiguration.java               # wires services/event bus/monitors
├── CompilerCompilationGuard.java          # serializes direct compiler compilation/resolution
├── BallerinaWorkspaceManager.java         # legacy monolith, not in live path
├── BallerinaWorkspaceManagerProxy(Impl).java  # deprecated, zero callers
│
├── workspacemanager/
│   ├── ProjectService(Impl).java, ProjectLoader.java, LockingMode.java
│   ├── project/       # Project, ProjectKind, ProjectTier, ProjectHealthState, ...
│   ├── uri/            # UriResolver, DocumentUri (sealed: FileUri|ExprUri|AiUri), TrieNode
│   └── change/         # ChangeBuffer, ChangeApplier, BufferedChange, ChangeLayer
│
├── compilerengine/
│   ├── CompilationService(Impl).java, CompilationPipeline.java, CompileTask.java
│   ├── snapshot/       # DualSnapshotStore, StableSnapshot, InProgressSnapshot
│   └── recovery/       # CancellationToken, ResolutionResult, FailureClass
│
├── executionmanager/    # ExecutionService, ProcessId, ProcessState, ExecutionMode
├── execution/           # ExecutionServiceImpl, ExecutionProcess, ProcessRegistry
├── observability/       # TelemetryEmitter, TraceLogSink(+impls), WorkspaceTraceLogger
├── resourcemonitor/     # HeapPressureMonitor, HeapPressureLevel, PressureDirection
└── eventbus/
    ├── EventSyncPubSubHolder.java, SubscriberTier.java, EventConsumer.java
    └── event/           # DomainEvent, ProjectEvent, CompilerEvent, ProcessEvent, ...
```

## Verification

- **Acceptance tests** — `langserver-core/src/test/java/.../workspace/test/acceptance/`.
  One class per cross-cutting behavior (a "Key Fact" above), not per class under test — e.g. a
  behavior spanning the event bus and multiple contexts gets one `*Test` exercising the whole
  flow through public APIs, not mocks of internals.
- **Unit tests** — co-located under `.../workspace/`, mirroring the source package structure,
  one `<ClassName>Test` per class. Cover the class's own invariants (bounds, state transitions,
  error paths) in isolation.

