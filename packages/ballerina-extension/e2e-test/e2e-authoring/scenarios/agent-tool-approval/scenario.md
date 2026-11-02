Agent tool approval functions (HITL).

The scenario creates a project with a Chat Agent Service, then manages a custom
agent tool's `requiresApproval` function entirely through the product UI and
checks the generated source after each save: the tool is created with a new
approval function whose parameters mirror the tool; adding a tool parameter
updates the approval function; the approval function's own form shows its
parameters read-only; removing the function leaves `requiresApproval: true` and deletes it;
adding one again on the edit page generates it; turning approval off drops the
field and deletes the function; renaming the tool keeps the reference; and deleting the tool deletes its
approval function too.

| Step | Flow (review page) | Verifies in source |
|---|---|---|
| 01 | setup | project + integration |
| 02 | setup | Chat Agent Service with an agent node |
| 03 | Create a tool with a new approval function (Agent Tool page) | `@ai:AgentTool {requiresApproval: sendEmailApproval}` and `isolated function sendEmailApproval(string to, string subject) returns boolean` |
| 04 | Edit a tool's parameters | yellow sync note; after save `sendEmailApproval(string to, string subject, string cc)` |
| 05 | Edit the approval function's parameters | function form shows Parameters read-only (no add / edit / delete) |
| 06 | Remove (detach) | `requiresApproval: true`; `sendEmailApproval` deleted |
| 07 | Add an approval function while editing | inline add form; `requiresApproval: sendEmailApproval` and the generated function |
| 08 | Rename the tool | renamed tool keeps `requiresApproval: sendEmailApproval` |
| 09 | Turn Requires Approval off | no `requiresApproval` in the annotation; `sendEmailApproval` deleted |
| 10 | Delete the tool | after re-adding an approval function, deleting the tool removes both the tool and its approval function |

Gaps (not covered here, covered by L2/L3 tests instead):
- Tool form mismatch warning and the shared-function warning need the approval
  function edited out of step, or two tools pointing at one function. Both can
  only be set up by editing `.bal` code by hand, which this harness avoids.
  See `ApprovalEditor.test.tsx` and the LS `ApprovalFunctionSyncTest`.
- Deleting the approval function is intentionally not covered.
