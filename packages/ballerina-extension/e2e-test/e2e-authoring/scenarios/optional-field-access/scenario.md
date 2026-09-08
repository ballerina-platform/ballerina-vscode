# Optional field access — helper pane generates `?.` across nilable navigation (issue #2173)

Regression coverage for
[ballerina-vscode#911](https://github.com/ballerina-platform/ballerina-vscode/pull/911)
/ [product-integrator#2173](https://github.com/wso2/product-integrator/issues/2173):
"Incorrect Expression Generated for Nullable Optional Field Access".

When the helper pane builds a field-access path that passes **through a nilable
value** — e.g. a record field `meta` of a nilable record type `Meta?` — the
access to the next field must use the optional field-access operator `?.`
(`doc.meta?.documentId`), not plain member access `doc.meta.documentId` (a
compile error, because `meta` may be nil). The fix tracks nilability across
breadcrumb navigation (`accessSeparator` / `isNilableAfterAccess` /
`getLeafSeparator`) so the hop after a nilable step is joined with `?.`.

The end-to-end flow declares a record variable whose type has a nested nilable
record field, then builds a second variable's expression **through the helper
pane's Variables section** — drilling into the record, then into the nilable
`meta` field, then selecting `documentId` — and confirms the generated
expression uses `doc.meta?.documentId`.

## Types

```ballerina
type Meta record {|
    string documentId;
    string label?;
|};

type Doc record {|
    string name;
    Meta? meta;
    string docId?;
|};
```

## Cases (all confirmed against the fixed build)

| Drill path | Generated | Why |
|------------|-----------|-----|
| `doc` → `meta` → `documentId` | `doc.meta?.documentId` | `?.` after the nilable `meta` (required leaf) |
| `doc` → `meta` → `label` | `doc.meta?.label` | `?.` after the nilable `meta` (optional field inside it) |
| `doc` → `docId` | `doc.docId` | plain `.` — the root `doc` is not nilable, so an optional primitive field at the root is not given a spurious `?.` |

## Steps

| # | Action | Verification |
|---|--------|-------------|
| 1 | Create project + integration | Integration overview visible |
| 2 | Provide record types `Doc`/`Meta` (with the nilable field `Meta? meta`) | `types.bal` has `Meta? meta;` |
| 3 | Add an Automation artifact | Flow diagram visible |
| 4 | Add a Declare Variable node (`doc`, `Doc`, value `{name: "sample", meta: ()}`) and save | `automation.bal` has `Doc doc = {name: "sample", meta: ()}` |
| 5 | Add a Declare Variable node (`docId`, `string?`); focus the Expression editor, open the helper pane's **Variables** section, drill into `doc`, then drill into the nilable `meta` field, then click `documentId` | Expression editor shows `doc.meta?.documentId` (with `?.`, not `.`) |
| 6 | Save | `automation.bal` has `string? docId = doc.meta?.documentId` and does **not** contain `doc.meta.documentId` |

## Notes / Gaps

- **The trigger is nilability *across navigation*, not a single optional field.**
  A plain single optional field (`string documentId?`) accessed directly does
  *not* make the helper pane emit `?.` — it produces `doc.documentId` (the
  language server does not hint `?.` for it and the `doc` parent is not nilable).
  The `?.` appears when a breadcrumb step is nilable (here, drilling into the
  `Meta? meta` field), so the next hop is joined with `?.`.
- The types are provided as a fixture (committed spec:
  `e2e-playwright-tests/data/optional_field_access_project`). The authoring
  scenario seeds `types.bal` and reloads the window so the language server
  re-indexes them — the type editor cannot enter a nilable custom type like
  `Meta?` reliably (typing `Meta?` into the `vscode-text-field` type cell does
  not commit to the form model and leaves Save disabled), and record type
  creation is owned by the type-editor scenarios anyway.
- Helper pane navigation: each Variables row is a `HelperPaneListItem`.
  Clicking the row label inserts the value (`onItemSelect`); clicking the
  trailing chevron navigation arrow (`onClickEndAction`) drills into a record's
  fields. Records (`doc`, `meta`) show the arrow (`shouldShowNavigationArrow`);
  the primitive `documentId` field does not, so its row is clicked directly to
  insert it.
- Selector stability: the list item and its navigation arrow needed stable
  `data-testid`s added to `HelperPaneListItem` — `helper-pane-item-<label>` on
  the clickable row and `helper-pane-nav-<label>` on the chevron — since the
  chevron is an Emotion-styled `<div>` with no stable hook otherwise.
