Import a Ballerina record type from an XML sample via the Type Editor Import tab.

The scenario opens the Type Editor, clicks "Add Type", switches to the "Import"
tab, changes the Format dropdown from JSON to XML, pastes an XML document with
a "person" root element containing name and age child elements, clicks "Import",
and verifies the generated type node (named from the root element) appears in
the type diagram.

Note: Unlike JSON import, the XML import does NOT show a Name field — the type
name is inferred from the XML root element tag ("person" → "Person").

## Steps

| # | Action | Verification |
|---|--------|-------------|
| 1 | Create project and navigate to Type Editor | Type Editor canvas with "Add Type" button visible |
| 2 | Click "Add Type", switch to "Import" tab, change format to XML, paste XML, click "Import" | Type node derived from root element appears in diagram |
| 3 | Verify diagram node and source | `data-testid^="type-node-"` present; types.bal contains the generated record |

## Gaps

- Format dropdown: `vscode-dropdown#format-selector` — must be changed from JSON to XML.
  Click the dropdown, then click `vscode-option[value="XML"]`.
- After switching to XML, the Name field disappears and the textarea placeholder
  changes to "Paste your XML here...".
- The generated type name comes from the XML root element. For `<person>...</person>`
  the type will likely be named "Person" (capitalised by the backend).
