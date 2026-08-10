# Expression editor advanced — expanded editor, signature help, constructs, connectors, and agent prompt

Create an integration project with an Automation artifact and a custom record
type `Person` (created through the type diagram). In a Declare Variable node:
expand the expression editor to its full-screen/modal view, type an expression
there, collapse it and confirm the value is preserved inline. Write a function
call and confirm signature help (parameter hints) appears. Declare a `Person`
variable using the record-config support, switching between the record form
view and the raw expression view without errors, and edit the record through
the record config editor with the helper pane — including creating a new
configurable via the "Add New Config" button and confirming it renders as a
blue chip with no error. Then add a MySQL connector, open its Query action,
toggle the SQL statement field between SQL format and expression format, and
save. Finally add an AI Agent from the side panel, use the prompt field's
expand mode with the markdown formatting tools, and save. Verify the generated
source at the end.

Covers EXPRESSION_EDITOR_TEST_SPEC.md scenarios 5, 8, 9, 12, 14
(function call, record construct view, signature help, expand editor,
record value) plus connector SQL-format and agent prompt editing flows not
in the spec.

## Steps

| # | Action | Verification |
|---|--------|-------------|
| 1 | Create project + integration; create record type `Person` (name/age fields) by navigating to the type diagram; add an Automation artifact | Flow diagram visible |
| 2 | Add a Declare Variable node (`greeting`, `string`) and click the "Expand Editor" button on the Expression field | Editor opens expanded (modal/full screen) |
| 3 | Type `"Hello World"` in the expanded editor | Text visible in the expanded editor |
| 4 | Collapse the expanded editor (close button or `Escape`) | Inline Expression field shows `"Hello World"` |
| 5 | Change the expression to a function call: type `"Hello".length(` (or `string:length(`) | Signature help popup appears with parameter/return info |
| 6 | Complete the call `"Hello World".length()` — adjust variable type to `int` | Signature help dismisses; no diagnostics |
| 7 | Save | Variable node in diagram |
| 8 | Add a Declare Variable node (`p`, `Person`); in the Expression use the record-config support (Create Value section or typed `{ name: "Anne", age: 30 }`); switch between the record form view and the raw expression view | Record template/fields inserted; no error occurs when toggling between the two views |
| 9 | Edit the record through the record config editor with the helper pane (Variables, Configurables, Functions, Inputs); create a new configurable via the "Add New Config" button and assign it to a field | Blue chip appears for the configurable and the value is shown without any error |
| 10 | Save | Node in diagram |
| 11 | Reopen the node, switch to Record mode, and untick the optional `age` field's checkbox in the Record Configuration modal | Expression value updates to drop the `age` entry entirely (e.g. `{name: personName}`); Save remains enabled |
| 12 | Save | Generated code's `Person p` record literal has no `age` field |
| 13 | Add a MySQL connector by clicking the add-connection button | MySQL visible in the side panel |
| 14 | Click the MySQL connector and select the Query action | Side panel opens the query form |
| 15 | Add an SQL statement and toggle between SQL format and expression format, then save | Save succeeds without error; statement is wrapped in SQL backticks; flow diagram shows the connector addition |
| 16 | Click AI in the side panel, select Agent, and add a new agent | Each navigation step lands on the expected view |
| 17 | Open the prompt field's expand mode and use the different markdown formatting tools; in the Query field, open the helper pane's Variables section and click the `greeting` (int) variable | Markdown formatting applied without errors; `greeting` renders as a blue chip in the Query field, same style as the configurable chip |
| 18 | Save | Generated agent's query argument is `string \`${greeting}\`` |
| 19 | Verify the generated source | Declarations, connector + query, and agent match the fixture |

## Gaps

All items below are CONFIRMED through the authoring daemon (steps 01–12).

- **No signature-help popup exists** in the multi-mode expression editor —
  typing `(` shows nothing. Function insertion help is completion-driven:
  typing `"Hello World".le` opens a CodeMirror autocomplete
  (`.cm-tooltip-autocomplete` with `[role="option"]` items like "length() int"),
  and accepting inserts the full call `"Hello World".length()`. The test
  covers this instead of a popup. Diagnostics render as inline text under the
  field (e.g. "missing close parenthesis token") and disable Save while
  invalid.
- Expand editor: floating buttons appear on field focus — `[title="Expand
  Editor"]`, and in the modal `[title="Minimize Editor"]`. Value is preserved
  across expand/collapse; the expression field container testid is
  `ex-editor-expression`.
- **Mode switcher** (`data-testid="primary-mode"` / `"expression-mode"`, slider
  `mode-switcher-slider-<fieldKey>`): only renders when the node template knows
  the field's special type. For a record variable that means it appears when
  EDITING the saved node, not during creation with a typed-in type — so create
  `p:Person` with a typed literal first, save, then reopen the node.
- Record mode shows a preview editor; **focusing it opens the "Record
  Configuration" modal** (`.unq-modal-overlay`) with heading "Record
  Configuration", text "Select fields to construct the record", and a
  `parameter-branch` checkbox tree (Person → name string / age int; required
  fields are checked+disabled). The modal's own expression editor edits the
  whole record value.
- Focusing the modal's expression editor opens the **helper pane menu**:
  Inputs / Variables / Configurables / Functions. Configurables →
  "New Configurable" opens an inline form (Variable Name / Variable Type /
  Default Value / Documentation) whose Save writes
  `configurable string personName = "Anne";` to `config.bal` and replaces
  whatever text was **selected** in the record field at the moment "New
  Configurable" was opened with the new reference.
- **Correct insertion technique (confirmed)**: don't create the configurable
  against an empty or fully-selected field — instead, with the record field
  holding a valid literal (e.g. `{name: "Anne", age: 30}`), use the CM API to
  select just the value to replace (e.g. the `"Anne"` span, found via
  `view.state.doc.toString().indexOf('"Anne"')` and a `view.dispatch({
  selection: { anchor, head } })`), *then* open Configurables → New
  Configurable. The saved configurable replaces exactly that selection,
  producing `{name: personName, age: 30}` directly — no manual clear+retype
  needed, and the surrounding structure is never at risk.
- **Close/reopen is NOT a safe fallback for a slow-to-render chip** (tried in
  the promoted e2e suite and found harmful): reopening the Record
  Configuration modal re-fetches the node's last **saved** value, discarding
  the in-progress (unsaved) configurable insertion and reverting the field
  back to the original literal (e.g. `"Anne"`). If the chip doesn't render
  promptly, wait longer (30s) rather than closing the modal.
- **Blue chip confirmed**: in Expression mode the configurable reference
  renders as an inline CM widget — `span[contenteditable="false"]` containing
  `i.fw-bi-variable` and the name, with inline style
  `background: rgba(59, 130, 246, 0.15)` (blue). Assert the style + icon.
- **Variable chip in prompt fields (confirmed)**: inserting a declared
  variable into a prompt-mode field (Role/Instructions/Query) via the helper
  pane's Variables section renders the exact same blue chip widget as the
  configurable chip — identical style and `i.fw-bi-variable` icon. The chip
  has `title="${varName}"`; Query is a Text-mode field, so the generated call
  wraps the reference in a string template: `check aiAgent.run(string
  \`${varName}\`)`. Use a **scalar** variable (e.g. `greeting`, an `int`) —
  interpolating the `p` record directly into a string template does not
  compile. Typing further text right after the inserted chip is also
  unreliable (a subsequent keyboard append can be silently dropped) — treat
  the chip insertion as the query's whole value rather than fighting cursor
  placement around it.
- **Node reopen click — root cause found via trace inspection**: a
  `click({force:true})` on a diagram node's text to reopen it intermittently
  did nothing, even though Playwright's own trace confirmed the click
  completed cleanly (no error, no timeout) with no resulting panel. This is
  the diagram library not reacting to a synthetic click event the way
  Playwright's `.click()`/`.click({force:true})` dispatches it — the same
  class of issue already solved for the diagram's add-button (see
  `openNodePalette`/`clickNextDiagramPlus`, which dispatch a full
  `pointerover → mouseover → mouseenter → pointerenter → pointerdown →
  mousedown → mouseup → click` sequence via `dispatchEvent`). Applying that
  same synthetic-event sequence to node-reopen clicks (`diagramClick` helper
  in the spec / `globalThis.diagramClick` in `prelude.js`) is the fix — not a
  timing/retry workaround. Two retry-based "fixes" were tried first and made
  things *worse* before this was found: a `hover()` before the click (without
  `force: true`, hover itself can get blocked by an intercepting overlay and
  time out), and retrying the click as soon as the target wasn't visible yet
  (a second click while the first was still slowly succeeding could toggle an
  already-open panel back closed).
- **Unchecking an optional field (confirmed)**: in the `parameter-branch`
  tree, a required field's checkbox is `disabled` (e.g. `name`); an optional
  field's checkbox (e.g. `age`, listed under "Optional fields") is enabled.
  Unchecking it (`aria-checked` flips to `false`) immediately removes that
  field's entry from the combined Expression value — `{name: personName, age:
  30}` becomes `{name: personName}`, not just a blank value — and Save stays
  enabled. The generated record literal in source correspondingly drops the
  field entirely.
- Appending to an existing expression value works fine for triggering
  completions — no need to clear and retype from scratch. Move the cursor to
  the end (`Meta+End`/`Control+End`) and type the suffix (e.g. `.le` after an
  existing `"Hello World"`) to get the same completion list.
- Field rows in the Record Configuration modal's `parameter-branch` tree have
  **no per-field value input** — only a checkbox (include/exclude) + name +
  type label. All value editing happens through the single combined
  expression editor at the bottom of the modal.
- MySQL: palette → "Add Connection" → search → card `#connector-mysql`
  (testid `function-card-MySQL`) → form defaults name `mysqlClient`, all
  params optional → "Save Connection" writes
  `final mysql:Client mysqlClient = check new ();` to `connections.bal`
  (pull can be slow — poll up to 5 min). The palette then lists the client;
  clicking it shows actions (Query / Query Row / Execute / …).
- SQL Query field: mode switcher labels are **SQL / Expression**. Typing
  `SELECT * FROM users` in SQL mode ↔ Expression mode shows
  `` `SELECT * FROM users` `` (backtick template) — round-trip preserves the
  value, Save stays enabled, and the generated call is
  ``mysqlClient->query(`SELECT * FROM users`)``.
- AI Agent: palette → AI → Agent → "Add Agent" — **no sign-in required**
  (default model provider `aiWso2modelprovider` is wired automatically). Form
  fields: Role + Instructions (Prompt-mode) and Query* (Text-mode), result
  `stringResult`; Save disabled until Query is filled.
- Prompt expand mode is a **rich WYSIWYG markdown editor** with toolbar
  buttons selected by `title`: Bold, Italic, Insert Link, Heading, Blockquote,
  Bulleted List, Numbered List, Insert Table, Generate Prompt with AI.
  Formatting produces `<strong>`/`<ul><li>` in the editor and real markdown in
  the generated source: `instructions: string \`**You are a helpful
  assistant**\n\n* Answer briefly\`` in `agents.bal`.
- Creating the `Person` type: hover the project explorer "Types" node and use
  the inline "View Type Diagram"/"Add Type" actions (the node itself has no
  click command); the type helper panel in the type editor lets you pick
  `int` for a field via dblclick on the `type-field` cell. Mark `age` as
  **optional** via the "?" icon button next to the field row
  (`vscode-button[title="Set as an Optional Field"]`) — its icon fill flips
  from `descriptionForeground` to `button-background` when active; generated
  source is `int age?;` and it later shows in the Record Configuration modal's
  field tree as "int (Optional)".
- **Mode switcher timing (confirmed, 4 independent live tests)**: the
  Record/Expression switcher (`data-testid="primary-mode"` /
  `"expression-mode"`) never renders during node CREATION — not immediately
  after setting Type=Person, not after 30s of waiting, not after focusing the
  Expression field, and not via a type-field autocomplete pick instead of
  typed text. It only mounts once the record-typed field is **reopened for
  editing on an already-saved node**. Create with a typed literal, save, then
  reopen — and wait generously (~30s) for the switcher right after the
  reopen-click, since that's the one point it's guaranteed to appear.
- Promotion shape: several serial tests inside one `test.describe.serial`
  (expanded editor + completion; record config + configurable chip; MySQL
  query SQL toggle; AI agent prompt markdown), sharing one project.
- Harness note: the authoring daemon failed to launch VS Code with
  `firstWindow: ...closed` — root cause was the macOS 104-byte unix-socket
  path limit hit by the long profile name; daemon.mjs now uses a short
  `bi-a-<session>-<pid>` prefix. Diagnose such failures with
  `DEBUG=pw:browser`.
