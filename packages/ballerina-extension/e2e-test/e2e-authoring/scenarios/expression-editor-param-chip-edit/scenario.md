# Expression Editor — Parameter Chip Click-to-Edit

Covers the fix in `packages/ballerina-side-panel/src/components/editors/MultiModeExpressionEditor/ChipExpressionEditor/`
where function-call argument chips in the chip-based expression editor were losing/misplacing
typed characters, corrupting sibling placeholder chips on a mid-value space, and missing clicks
that landed at a chip's edge instead of its center.

## Flow

1. Create a project + integration.
2. Create a `Function` artifact `getFullName(string firstName, string lastName) returns string`
   (the promoted spec instead loads a fixture with this function already defined and a real
   `return firstName + " " + lastName;` body, so the project stays diagnostic-clean — see
   `e2e-playwright-tests/data/expression_editor_param_chip_project/functions.bal`).
3. Create an `Automation` artifact to get a flow diagram.
4. Add a `Declare Variable` node (`Type = string`) and, in its "Initialize with value" expression
   editor, insert a call to `getFullName(...)`, producing two placeholder argument chips.
5. Click the first parameter chip and type a value containing a space (e.g. `"first name"`).
   Verify: the full typed text (including the space) lands inside that chip's tracked text, and
   the second (still-placeholder) chip is untouched. While still in edit mode, press Backspace and
   verify it deletes a single trailing character (not the whole chip) — this is a deliberate
   behavior change from Backspace next to a chip that ISN'T being edited, which removes the whole
   chip. Retype the character, then commit with Enter and verify the chip re-collapses (shows the
   finished value, not raw editable text).
6. Click the second parameter chip as close to its edge as possible (not dead center) to exercise
   the boundary-click fallback, type a value (e.g. `"last name"`), and commit by moving focus away
   instead of pressing Enter.
7. Save the form and verify `automation.bal` contains the fully correct call —
   `getFullName("first name", "last name")` — with no truncation, duplication, or missing
   comma/paren.

## Gaps

- Reference chips (variables/configurables picked from the helper pane) are intentionally out of
  scope — they keep their pre-existing click-to-select-whole-chip behavior and already have
  coverage via `expectBlueChip` in `expression-editor-advanced.spec.ts`.
- This authoring scenario's own step 02 creates `getFullName` live through the ParamManager UI
  and leaves its body empty (no `return`), which is a real compiler diagnostic
  ("This function must return a result") if that project were left open. That's fine for
  interactive re-authoring/iteration, but is exactly why the *promoted* Playwright spec uses the
  static fixture project above (with a real body) instead of building the function live each run.
