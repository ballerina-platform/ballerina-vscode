# Expression editor advanced — expanded editor, signature help, constructs, connectors, and agent prompt



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

