Import a Ballerina record type from a JSON sample via the Type Editor Import tab.

The scenario opens the Type Editor, clicks "Add Type", switches to the "Import"
tab, enters the type name "PersonJson", pastes a JSON object with name/age/city
fields, clicks "Import", and verifies the generated type node appears in the
type diagram canvas.

## Steps

| # | Action | Verification |
|---|--------|-------------|
| 1 | Create project and navigate to Type Editor | Type Editor canvas with "Add Type" button visible |
| 2 | Click "Add Type", switch to "Import" tab, fill Name and paste JSON, click "Import" | Type node "PersonJson" appears in diagram |
| 3 | Verify diagram node and source | `data-testid="type-node-PersonJson"` present; types.bal contains `PersonJson` record |

## Gaps

- The `vscode-text-area` inner textarea must be reached via `vscode-text-area textarea`
  since the component wraps a native textarea in shadow-like markup.
- The Name text field in the Import tab (JSON format) uses a `vscode-text-field` element;
  locate by label "Name" or `input[aria-label="Name"]`.
- Format dropdown uses `vscode-dropdown#format-selector`; already JSON by default so no
  change is needed for this scenario.
