# No new variable from a connection form

Covers wso2/product-integrator#1770. A connection form's helper panes offer no
**+ New Variable**, in its record editor (Record Configuration) or in a plain
field, whether the connection is new or being edited: a variable made there
would be a module-level declaration that BI lists nowhere, so it could not be
found or edited from the UI afterwards. Configurables cover that need. Outside
connection forms, a flow node's helper pane still offers **+ New Variable**.
The connection must still take values, save and compile.

| # | Action | Verification |
|---|--------|-------------|
| 1 | Create a project and an Automation | Flow diagram opens |
| 2 | Add Declare Variable `greeting` → Expression → Variables | **+ New Variable** is offered; node saves |
| 3 | Add Connection → HTTP | Connection form is visible |
| 4 | Open HTTP1 Settings in Record mode, select `proxy.host` | Record Configuration modal shows the record |
| 5 | In the record editor, host → Variables | No **+ New Variable**; `host: "proxy.local"` kept on close |
| 6 | Url (Expression) → Variables | No **+ New Variable**; Url takes `"https://foo.bar/baz"` |
| 7 | Save Connection | Saved as entered; the compiler reports it with no errors |
| 8 | Edit the connection → Url → Variables | No **+ New Variable** |
| 9 | Url = `"https://edit.example"`, Update Connection | Saved as entered; nothing but the Url changed since 7 |

Row 7 takes the http module's `ClientHttp1Settings.proxy` deprecation warning
as the compiler's verdict on the saved connection: nothing before the save
produces it. Row 9's edit leaves the problem counts unchanged, so the status
bar cannot show a verdict on it; the sources must instead be row 7's with only
the Url changed.

## Running on macOS

Run the daemon with `BI_E2E_VSCODE_VERSION=1.125.1`, the version the
Playwright suite pins. `playwright-vscode-tester` launches
`Contents/MacOS/Electron`, which recent VS Code renamed to `Code`, so the
daemon's default, `latest`, may not launch at all.

The pin only picks which VS Code is downloaded. The launcher always records
video and writes no `update.mode`, and the daemon can change neither:

- Video recording has kept the first VS Code window from loading on some Macs.
- The test VS Code can update itself mid-session, after which every launch
  fails with `Contents/MacOS/Electron: No such file or directory`. Delete
  `e2e-test/test-resources/Visual Studio Code.app` (and `stable.zip`) so the
  pinned version downloads again.
