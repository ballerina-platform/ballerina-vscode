Type editor buttons in the project explorer works or not

Start Integration project. Then navigate to the type diagram through the project explorer side panel ( left hand side panel) Verify whether type diagram view is shown. Create a type. Then again come to the home view by clicking the home button at the top. Then again click the + Button near the Types and click it then move to the type adding view then fille the type and name field. For the type field and when helpe plane opens click the create new type and add a new type and add that type to the field and save it.


## Steps

| # | Action | Verification |
|---|--------|-------------|
| 1 | Create project and navigate to Type Editor  through the side panel| Type Editor canvas with "Add Type" button visible |
| 2 | Click Add new type | Check side panel is open |
| 3 | Add name and fields | `data-testid="type-node-<Name>"` present |
| 4 | Click Home Button | Check whether Project diagram is visible |
| 5 | Click Add New Type Next to the Type | Check whther move to the type diagram and the Add new type side panel is open or not |
| 6 | Click the Add new fields | Helper plane is visible |
| 7 | Click create New Type | Verify popup is opened |
| 8 | Fill the type and save it | Popup closes and the new field's type shows the created type name |
| 9 | Click the type field again | Verify the type is present or not in the helper plane |
| 10 | Select the type and fill the earlier created Type | Verify the type is present or not |
| 11 | Add another field and click the optional button next to the type field | Verify the optional button click changed the colour |
| 12 | Save the type | Verify the generated ballerina code; and type is visible or not |
| 13 | click the three dots in the leaf type and click the edit | verify the side panel is opened or not |
| 14 | click edit the name of the type and save it | check the generated ballerina code |
| 15 | click the three dots in a parent type and click delete | check type is deleted or not  in the type diagram and the ballerina code |
| 16 | click three dots in the type that is remained and click focused view | Verify only the selected type is shown rather than all the types |
| 17 | click the three dots in the type and click source | side panel should open with the ballerina code and the type code which is relevant to that type should be in selected mode |


## Gaps

- The "Types" category node in the project explorer has **no click command** —
  clicking the row only expands/collapses. Navigation happens through its inline
  actions: "View Type Diagram" and "Add Type" (`BI.project-explorer.*` commands
  in the wso2-integrator wrapper manifest). Hover the tree item first, then click
  `a.action-label[aria-label*="View Type Diagram"]` / `[aria-label*="Add Type"]`.
- The home button in the webview TopNavigationBar had no `data-testid`/aria-label
  (only an `i.fw-bi-home` icon). Added `data-testid="home-button"` in
  `packages/ballerina-visualizer/src/components/TopNavigationBar/index.tsx` and
  rebuilt the VSIX.
- The "Create New Type" popup is a **nested type editor** — its testids
  (`type-create-save`, `create-from-scratch-tab`, `type-editor-container`, …)
  duplicate the main panel's. Scope all popup locators to `.unq-modal-overlay`
  and use `.last()`.
- The popup Save button needs `click({ force: true })` — a plain click is
  intercepted by the overlay.
- Helper-panel option clicks must be scoped to `.unq-modal-overlay`; a bare
  `getByText('Address', { exact: true })` hits the type node already rendered in
  the diagram behind the panel (this opens Edit Type instead of selecting).
- After clicking a helper-panel option the field input re-renders — poll/expect
  `toHaveValue` instead of reading the value once.
- Saving the popup auto-assigns the newly created type to the field that opened
  the helper panel.
- The optional-field toggle is `vscode-button[title="Set as an Optional Field"]`
  in the field row. Its icon colour flips from
  `g[fill="var(--vscode-descriptionForeground)"]` (inactive) to
  `g[fill="var(--vscode-button-background)"]` (active) — assert the fill
  attribute, not CSS classes.
- In the Edit Type panel the name field (`data-testid="type-name-display"`) is
  **readonly**. Renaming requires clicking the pencil
  (`vscode-button[title="Rename"]`), which swaps in an editable field with its
  own Cancel/Save pair. That rename Save is the *first* Save in the DOM; the
  panel's bottom Save is disabled during rename. Renaming updates all
  references across the project (Order.customer follows the new name).
- Node three-dots menu (`type-node-<Name>-menu`) items: Edit, Source, Delete,
  Focused View. Delete shows a confirmation dialog
  ("Are you sure you want to delete <Name>?") with Cancel/Delete buttons.
- Focused View hides the other type nodes in the **diagram only** (assert the
  other `type-node-*` testids have count 0); the project explorer tree still
  lists all types. The focused node's three-dots menu stays available.
- "Source" calls `goToSource`, which opens `types.bal` in a VS Code editor
  group **beside** the diagram (`ViewColumn.Beside`) and sets
  `editor.selection` to the type's range — in practice the type **name** token
  (e.g. `Customer`). Verify selection two ways: (1) Monaco renders selected
  ranges as `.monaco-editor .selected-text` overlay divs in the host DOM;
  (2) focus the editor via its tab (does not clear the selection), press
  Cmd/Ctrl+C, and read the clipboard through the Electron main process
  (`vscode.evaluate(({ clipboard }) => clipboard.readText())`) — it should
  contain the type name. Write a sentinel to the clipboard first to avoid
  stale reads.
