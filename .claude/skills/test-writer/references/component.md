# L2 — Component tests

Guide section: `docs/TEST_GUIDE.md` → "L2 — Component (render semantics)".

## Decide

- **Context:** provide what the component reads, nothing more. Props only → `render`;
  `useFormContext` → `renderWithForm`; `useRpcContext` → `renderWithRpc` with a fake
  client. The guide's "Choice 1" table names the harness files.
- **Data:** synthetic data for rules and edge cases the language server will not
  return. A captured fixture when the defect is "the component breaks on the real
  shape the language server returns"; that needs a `*.capture.test.ts` (run by a
  non-`jest.config.js` config) and a fast `*.render.test.tsx`.
- **Push to L4** when the behaviour needs CodeMirror editors or interaction that
  advances `requestAnimationFrame` (array add or remove, save-button enable). jsdom
  cannot run these. jsdom also does not render CSS (`::after` content) and does not
  upgrade VS Code web components, so it cannot show what they display or compute.
  Test what they read instead (the attribute, the label's text) at L2, and leave the
  rendered result to L4.
- **Render before ruling out.** Before leaving a component out as not renderable in
  jsdom, render it once with the harness its context needs. Components that read form
  state or call hooks such as `useFieldDiagnostics` usually render with `renderWithForm`.
- **RPC managers that import `core/extension.ts`** (for example the bi-diagram RPC
  manager) cannot be imported in a test. Cover them with captured fixtures.

## Write

- Assert meaning: which editor is chosen, that a node or link is present, that a value
  is registered in the form. Do not assert class names or styling.
- Assert on what the consumer reads, not only on the part that changed. For example,
  compare a label's whole text with and without the new element, rather than checking
  that the element's own text is empty.
- Include the component where the defect was reported in the invariant's table.
- A snapshot alone is not a test of the change; pair it with a semantic assertion that
  fails on the defect.
- For editor selection, a new `FormField` fixture in `fixtures/fields/` is picked up by
  the `EditorFactory` invariant without a new test file.

## Run

```bash
(cd packages/<pkg> && npx jest <path-to-test>)
node scripts/typecheck-tests.js    # from the repository root
```
