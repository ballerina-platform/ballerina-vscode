Verify that the Type Editor surfaces language-server diagnostics inline for
invalid input in a record field's Type box and in its name box.

The scenario creates a record type `Organization` through the Type Editor, then
opens "Add Type" again and adds a record field whose Type is a type that does
not exist in the project. That field must show the language server's
undefined-type diagnostic inline, and the diagnostic must clear once a real type
is entered. The field's name is then set to a Ballerina reserved keyword, which
must show the reserved-keyword diagnostic and clear once corrected. The panel is
closed without saving, leaving the project unchanged.

This covers ballerina-vscode PR #961 / product-integrator#2181: the type editor
sent a bare `types.bal` as `filePath` to `expressionEditor/diagnostics`, so the
language server could not resolve the project and the request failed with
`ProjectException: provided file path does not exist`. The diagnostic was
therefore never rendered — the fields stayed silent on invalid input. The fix
resolves the file name against `projectPath` in `TypeField.tsx` and
`IdentifierField.tsx` (and in the context-based editors).

## Steps

| # | Action | Verification |
|---|--------|-------------|
| 1 | Create project and open the Type Editor | Type diagram with "Add Type" button visible |
| 2 | Add record type `Organization` with one field, save | `data-testid="type-node-Organization"` present |
| 3 | Add Type -> add a field, set its Type to `NoSuchTypeHere` | `undefined type 'NoSuchTypeHere'` shown |
| 4 | Set the Type back to `string`; set the field name to `function` | Diagnostic clears, then ``function` is a reserved keyword`` shown; clears once the name is corrected |
| 5 | Close the panel without saving | No `DiagnosticsProbe` node; `types.bal` unchanged |

## Gaps

- **The type's own Name box is not coverage for this fix.** It is served by
  `TypeCreatorTab` in `TypeEditor.tsx`, which already resolved the path against
  `projectPath` before PR #961 — a duplicate type name reports
  `redeclared symbol '<name>'` on both sides of the fix. Only the field-level
  boxes (`TypeField.tsx`, `IdentifierField.tsx`) flip from silent to
  diagnosing. `ContextTypeCreator.tsx` / `EditTypeView.tsx`, also in the PR,
  are reached only through `EntryPointTypeCreator`, not the type diagram, so
  this scenario does not exercise them.
- A duplicate record *field* name produces no diagnostic even after the fix, and
  neither does an invalid identifier in the edit view's "Type name" box — so
  neither is usable as an assertion.
- The diagnostic text renders through `TextField`'s `errorMsg` -> `ErrorBanner`
  in the ui-toolkit (a `submodules/` package, out of scope to edit), which has
  no `data-testid`. The warning codicon is its only stable marker.
- Validation is debounced 250ms and then round-trips to the language server, and
  the banner can briefly show the message for an intermediate keystroke — wait
  for the settled text, not the first message to appear.
- `add-field-button` is a div wrapping a `vscode-button`; the handler is on the
  inner button, so `domClick` on the div is a no-op. It also reports as outside
  the viewport while the panel is laying out, so force-click it in a retry loop.
- The "Create from scratch" / "Import" tab buttons render outside the viewport at
  the test window size; Playwright refuses even a force-click, so they need a
  real DOM click (`domClick`).

## Environment note

The authoring daemon (and the committed Playwright suite) launch VS Code through
`@wso2/playwright-vscode-tester`, which hardcodes `Contents/MacOS/Electron` as
the macOS executable. VS Code renamed that binary to `Code` in a release after
1.100.0, so an unpinned `latest` download leaves the harness unable to launch.
Run with `BI_E2E_VSCODE_VERSION=1.100.0` (the version
`package.json`'s `e2e-test-setup` script already pins).
