Configuring the `init` method of a Service Class from the service class designer.

Create an integration project, add a Type artifact and create a Service Class.
Open the created service class for editing — the designer must render the
generated `init` method as a FunctionCard under its own **Constructor** section
(kind badge `INIT`), not as the old read-only "Constructor: init" link. Click the
card's edit action; it opens the Service Function form, whose model carries the
init guards (name not editable, return type disabled) and the parameter schema.
Add a parameter through the Parameters param-manager, save, and confirm the new
parameter reached `types.bal` and survives reopening the form.

## Steps

| # | Action | Verification |
|---|--------|-------------|
| 1 | Create project/integration and open the Type Editor | "Add Type" button visible |
| 2 | Add Type → Kind "Service Class", name `Greeter`, Save | `data-testid="type-node-Greeter"` present |
| 3 | Open the `Greeter` node menu → Edit | Service class designer open ("Method"/"Variable" buttons visible) |
| 4 | Inspect the Constructor section | "Constructor" heading, `INIT` badge, `edit-method-button-init` present |
| 5 | Click `edit-method-button-init` | Service Function form opens; name field reads `init` and is not editable |
| 6 | Add Parameter: type `string`, name `greeting` → Add | `greeting-item` param row rendered |
| 7 | Save the form | Back on the service class designer, Constructor card still present |
| 8 | Verify persistence | `types.bal` declares `function init(string greeting)` |

## Gaps

- The New Type panel can come up on the **Import** tab, where the Kind dropdown
  `createType()` fills does not exist (`waitForTypeEditor()`'s
  `type-editor-container` is present on both tabs, so it does not discriminate).
  The tab buttons carry no `data-testid` — `create-from-scratch-tab` is the id of
  the content they reveal. Click the tab by its accessible name and wait for that
  container. Switching tabs resets the form, so click before filling.
- `init` renders as a FunctionCard with `edit-method-button-init` /
  `delete-method-button-init` and an uppercased `INIT` kind badge, inside a
  "Constructor" section above Class Variables. It is not duplicated under Methods.
- The card's edit action opens the **Service Function** form, and the init guards
  hold there: the Function Name field is `init` and `readonly`, and no Return Type
  field is rendered at all (`getByRole('textbox', {name: /Return Type/})` → 0).
- ParamManager's add affordance is a `LinkButton` (a div with `i.codicon-add`),
  not a `<button>` — `getByRole('button', {name: 'Add Parameter'})` never matches.
- The Parameter Type field is a `FormExpressionEditor` with **no** `data-testid`.
  It exposes its label through `arialabel` on the `vscode-text-area` host, and the
  editable node is that host's shadow-DOM `textarea`:
  `vscode-text-area[arialabel="Parameter Type"] textarea` (the same convention
  `TypeEditorUtils.waitForTextbox()` already uses). Typing opens the
  `add-type-completion` popup — dismiss it with Escape.
- The param editor's **Add** button stays disabled until the typed values
  validate. A `click({force: true})` before then silently no-ops and leaves the
  editor open, so the row never appears — wait for it to be enabled first.
- `ParamItem`'s testid is `<key>-item`, and a new param's key is `""` while it is
  being edited; it becomes the parameter name only after Add. So `greeting-item`
  is a valid post-condition for the save, not for the edit.

## Local harness notes (macOS)

- `playwright-vscode-tester` hard-codes the VS Code executable at
  `Contents/MacOS/Electron`. VS Code renamed it to `Code` in recent versions, so a
  `latest` download (the authoring daemon's default) cannot be launched at all.
  The committed suite pins `1.125.1`; run the daemon the same way:
  `BI_E2E_VSCODE_VERSION=1.125.1 node .../scripts/daemon.mjs <name>`.
- The launcher writes no `update.mode`, so the test VS Code auto-updates itself
  and replaces the bundle mid-session — after which every later launch fails with
  `Contents/MacOS/Electron: No such file or directory`. Recovery: delete
  `e2e-test/test-resources/Visual Studio Code.app` (and `stable.zip`) and let the
  pinned version download again.
