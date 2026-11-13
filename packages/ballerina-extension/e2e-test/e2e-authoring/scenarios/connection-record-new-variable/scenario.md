# No new variable from a connection form

Covers wso2/product-integrator#1770. A connection form's helper panes offer no
**+ New Variable**, in its record editor (Record Configuration) or in a plain
field, whether the connection is new or being edited: a variable made there
would be a module-level declaration that BI lists nowhere, so it could not be
found or edited from the UI afterwards. Configurables cover that need. Outside
connection forms, a flow node's helper pane still offers **+ New Variable**,
and the variable it declares is saved before the node and read by the field
it was made from.
The connection must still take values, save and compile.

| # | Action | Verification |
|---|--------|-------------|
| 1 | Create a project and an Automation | Flow diagram opens |
| 2 | Add Declare Variable `greeting` → Expression → Variables → **+ New Variable** `salutation = "hello"`, Save | Its form opens, not named `greeting`; Expression reads `salutation`; the node is still named `greeting`, and saves with `salutation` declared before it; no compile errors |
| 3 | Add Connection → HTTP | Connection form is visible |
| 4 | Open HTTP1 Settings in Record mode, select `proxy.host` | Record Configuration modal shows the record |
| 5 | In the record editor, host → Variables | No **+ New Variable**; `host: "proxy.local"` kept on close |
| 6 | Url (Expression) → Variables | No **+ New Variable**; Url takes `"https://foo.bar/baz"` |
| 7 | Save Connection | Saved as entered; no compile errors |
| 8 | Edit the connection → Url → Variables | No **+ New Variable** |
| 9 | Url = `"https://edit.example"`, Update Connection | Saved as entered; no compile errors |

The `ClientHttp1Settings.proxy` deprecation warning from the http module is
expected.

## Running on macOS

The shared launcher records video, which keeps the first VS Code window from
loading on some Macs, and the test VS Code updates itself in place unless
`update.mode` is `none`. Run with `BI_E2E_VSCODE_VERSION=1.125.1` (the version
the Playwright suite pins).
