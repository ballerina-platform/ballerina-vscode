---
name: data-map
description: Use this skill whenever you are generating Ballerina mapping/transformation expressions between any data types — records, JSON, XML, arrays, or primitive types (e.g. implementing a transform function body, converting JSON to a record, mapping XML elements to fields, or transforming primitive values).
---

### Mapping Request
$ARGUMENTS

Interpret the request above using whichever of these patterns fits:
- "generate mappings for the <functionname> function" → function mode; the function name is the word immediately before "function".
- "generate mappings using input as <inputs> and output as <output> using the <name> function" → records mode; create a new transform function with that signature.
- "generate mappings using record fields and external values" → inline mode; derive the output type from "Output type: <name>" in the hidden context.
- A single function name (no surrounding text) → function mode; fill out the existing function with the mapping.
- A single record/type name with no surrounding text and no function context → inline mode; produce inline field expressions, not a function body.
- Empty (literal `$ARGUMENTS` left in place) → derive everything from the current file context provided in the hidden context.

### Priority Hierarchy
When generating mapping expressions, follow this strict priority order:
1. **User-defined mappings** — ABSOLUTE HIGHEST PRIORITY. Complete precedence over everything else.
2. **Existing sub-mappings** — use the sub-mapping output name as a direct reference.
3. **Context and constraints** — apply all provided business rules and transformation logic.
4. **Ballerina programming knowledge** — use built-in functions and standard approaches.
5. **Default handling** — only for non-optional fields when no mapping is available.

### Mapping Output Modes

There are two distinct mapping modes. Choose the correct one based on the task:

**Mode 1 — Transform Function (reusable mapping)**
When implementing a named Ballerina transform function, you MUST use the expression body syntax with `=>`. This is critical: the `=>` expression body is what the Ballerina tooling uses to classify the function as a Data Mapper. A block-body function with `return` will be placed under "Functions" instead of "Data Mappers" and will not work as a data mapper.

- The syntax is: `function name(params) returns Type => { field: expression, ... };`
- NEVER write a block body with `{ ... }` braces and a `return` statement — that produces a regular function, not a data mapper.
- The `{...}` after `=>` is a record constructor. Each entry is `outputField: expression`. Do not use `return` or variable declarations inside it.
- For intermediate values, use a `let` expression before the record constructor (see the `let` section below).

**Mode 2 — Inline Field Expression**
When mapping individual output fields directly inside a service or resource function (not writing a transform function body) — for example, when constructing a record variable inline — produce a single standalone expression for each field:

- Do **NOT** use `=>`, function declarations, or `let` expressions — just the expression itself.
- Do **NOT** use `return` statements.
- If complex logic is needed, define a separate helper function and call it from the expression.

### Schema and Type Handling
- Never use generic types like `anydata` or `any`; use exact type names from the schema.
- For nullable/optional types, always use the `?` suffix (e.g. `string?`), never `string|()`.
- Only reference fields and symbols that exist in the schema.
- Use existing submappings within the data model schema when available.
- Ensure type compatibility between input and output fields.
- For imported package records, use only the package alias (the part after the colon).
- When declaring nullable types, use ONLY the `?` suffix (e.g. `string?`, `CustomType?`). Never combine `|()` with `?`.

### Field Access
- Use `?.` (safe navigation) **only** when the field is actually optional or nullable.
- Use `.` (dot notation) for non-optional, non-nullable fields.
- Same-type input/output → direct assignment, even for optional fields.
- Different types → apply appropriate transformation/conversion.
- For output field names, always use dot notation from the root level.

### Union Types and Enums
- When either input or output is a union type or enum, always create a custom helper function — never handle inline.
- For nested union types, create a separate function per nesting level — each function must handle only one level of union complexity.
- Handle type narrowing using `is` checks or `if-else` type narrowing inside helper functions.
- Use exact type names from the schema in all function signatures.

### Mapping Strategy
- Map at **field level**, not at record or array level.
- Break down complex structures and map their individual components.
- For arrays of records, analyze individual fields within those records.
- Use query expressions (`from var x in inputArray select {...}`) **only** when both input and output are arrays — otherwise do not use this pattern.
- For nested record structures, use record constructor expressions calling appropriate helpers.

### Custom Functions for Advanced Transformations
Define separate Ballerina functions for logic that cannot be expressed as a simple inline expression:
- Union type / enum handling
- Multi-step computations reused across multiple output fields
- Any transformation requiring conditionals or loops

Place all helper function definitions before the main transform function.

### `let` Expressions for Reusable Sub-Mappings
Use a `let` expression only in these two cases:
- The user explicitly requests sub-mappings in their prompt, or
- The same intermediate value is needed by multiple output fields (sub-mapping reuse)

- The syntax is: `function name(params) returns Type => let Type varName = computedExpression in { fieldA: varName, fieldB: varName, ... };`
- The `let` binding goes between `=>` and the record constructor, with `in` separating them.
- Use `let` **only** inside an expression-body function for reusable intermediate values.
- Do **not** use `let` clause inside query expressions (`from ... select`).
- For complex logic that cannot be expressed with a single `let`, define a separate helper function instead.

### Regular Expression Operations
- Use Ballerina's `lang.regexp` library: `import ballerina/lang.regexp;`
- Create RegExp values with the `re` template: `` re `[0-9]+` ``
- Common functions: `regexp:isFullMatch()`, `regexp:find()`, `regexp:findAll()`, `regexp:replace()`, `regexp:replaceAll()`, `regexp:split()`

### Reserved Keywords
Ballerina reserved keywords cannot be used as plain identifiers. Prefix them with a single quote (`'`) when used as field names, variable names, or loop element variables.
Reserved keywords: {{KEYWORDS}}

### Ballerina Syntax Rules
- Write syntactically correct Ballerina — no compilation errors.
- Use `.toString()` for type conversion to strings.
- Use `check` for error handling — never `trap` or `panic`.
- Handle union types and enums using `check` expressions or `if-else` type narrowing.
- For nested field access, use dot notation.
- Use Ballerina built-in methods for transformations.
- Prefer record constructor expressions for nested structures.
- Only provide default values for non-optional fields that have no available mapping.
- Do not provide default values for fields that have explicit mappings or for optional fields.

### Repairing Mapping Errors
After writing mapping code, check for compilation errors. If errors appear on a mapping expression, fix them focusing on:

1. **Type compatibility** — ensure the expression produces the correct type for the output field.
2. **Field access** — use correct syntax for accessing record fields; required fields use `record.field`, optional fields use `record?.field`.
3. **Null safety** — handle optional/nilable types appropriately.
4. **Function calls** — verify imported functions are called correctly.
5. **Type conversions** — add necessary type casts or conversions.
6. **Syntax errors** — fix any Ballerina syntax issues.

Repeat until there are no errors on the mapping expressions.
