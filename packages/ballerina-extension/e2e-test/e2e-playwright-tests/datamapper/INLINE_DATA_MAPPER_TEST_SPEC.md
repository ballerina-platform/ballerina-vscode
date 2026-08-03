# Inline Data Mapper - Test Specification

## Application Overview

The Inline Data Mapper feature in WSO2 Integrator: BI allows users to create data transformations directly within variable declarations in flow diagrams. Unlike reusable data mappers, inline data mappers are embedded in the flow logic and are created from variable declaration forms. Users can create field mappings, edit expressions, convert to query expressions, and create sub-mappings within the inline context. Inline data mappers are opened as popups or inline views from variable declaration nodes.

## UI Elements Identified

### Buttons and Actions
- **Data Mapper** button/icon - in variable declaration form
- **Open Inline Data Mapper** action - from variable declaration node
- **Close** button (icon: ✕) - in inline data mapper popup/view
- **Save** button/action - for saving inline mappings
- **Auto Map** button (text: "Auto Map", icon: 🤖) - in inline data mapper toolbar
- **Undo** button (icon: ↶) - in inline data mapper toolbar
- **Redo** button (icon: ↷) - in inline data mapper toolbar
- **Add Sub Mapping** button (text: "Add Sub Mapping", icon: ➕) - in field sections
- **Convert to Query** button/action - for converting mapping to query expression
- **Add Clause** button/action - for adding query clauses
- **Delete Clause** button/action - for removing query clauses
- **Delete Mapping** button/action - for removing mapping links

### Form Fields
- **Variable Name** - from variable declaration form
- **Variable Type** - from variable declaration form
- **Expression bar** - for editing mapping expressions
  - Text field for expression input
  - Expression completion support
  - Save button (icon: ✓)

### Inline Data Mapper Editor Elements
- **Inline Data Mapper** header/title
- **Input section** - displays available input variables and their types
  - Field items showing variable name and type
  - Expand/collapse icons for nested structures
  - Field selection indicators
- **Output section** - displays output type and mapped fields
  - Field items showing field name and type
  - Expand/collapse icons for nested structures
  - Mapped field indicators
- **Expression bar** - for editing mapping expressions
  - Text field for expression input
  - Expression completion support
  - Save button (icon: ✓)
- **Mapping links** - visual connections between input and output fields
- **Sub-mapping indicators** - shows when a field has sub-mappings
- **Breadcrumb navigation** - for navigating sub-mappings

### Navigation Elements
- **Variable Declaration Node** - in flow diagrams
- **Data Mapper button/icon** - in variable declaration form
- **Popup/Inline View** - for displaying inline data mapper
- **Context menu** - on variable declaration node for opening data mapper

## Missing Test IDs Recommendations

The following test IDs should be added for better testability:

1. `data-testid="variable-declaration-node"`
2. `data-testid="data-mapper-button-in-form"`
3. `data-testid="open-inline-data-mapper-button"`
4. `data-testid="inline-data-mapper-editor"`
5. `data-testid="inline-data-mapper-popup"`
6. `data-testid="inline-expression-bar"`
7. `data-testid="inline-expression-input"`
8. `data-testid="save-inline-expression-button"`
9. `data-testid="inline-input-field-[FieldName]"`
10. `data-testid="inline-output-field-[FieldName]"`
11. `data-testid="inline-mapping-link-[InputField]-[OutputField]"`
12. `data-testid="delete-inline-mapping-button"`
13. `data-testid="inline-add-sub-mapping-button"`
14. `data-testid="inline-convert-to-query-button"`
15. `data-testid="inline-add-clause-button"`
16. `data-testid="inline-delete-clause-button"`

## Test Scenarios

### 1. Open inline data mapper (Description: Click data mapper button in variable declaration form)

**Steps:**
1. Open a flow diagram editor
2. Add a variable declaration node to the diagram
3. Click on the variable declaration node to configure it
4. Verify the variable declaration form opens
5. Verify the "Inline Data Mapper" button/icon is visible in the form when we create and select a new type called Person
6. Click on the "Inline Data Mapper" button/icon
7. Verify the inline data mapper opens (as popup or inline view)
8. Verify the inline data mapper editor is displayed
9. Verify the input section shows available variables from the flow context
10. Verify the output section shows the variable type
11. Verify the expression bar is visible
12. **Verify the source generated:**
    - Verify the inline data mapper source code is accessible
    - Verify the variable declaration includes the data mapper expression
13. **Verify the diagram:**
    - Verify the inline data mapper view is correctly displayed
    - Verify navigation between flow diagram and inline data mapper works

---

### 2. Simple field mapping (Description: Create mapping in inline context)

**Steps:**
1. Open an inline data mapper
2. Verify the input section displays available input variables
3. Verify the output section displays the output type fields
4. Select an input field (e.g., from an input variable)
5. Drag or map it to a corresponding output field
6. Verify a mapping link is created between the input and output fields
7. Verify the output field shows the mapped value indicator
8. Verify the expression bar displays the mapping expression
9. **Verify the source generated:**
    - Verify the mapping expression is generated in the variable declaration
    - Verify the expression correctly maps input to output field
10. **Verify the diagram:**
    - Verify the mapping link is visually displayed in the inline data mapper
    - Verify the field relationship is correctly represented

---

### 3. Multiple field mappings (Description: Create multiple mappings)

**Steps:**
1. Open an inline data mapper with multiple input and output fields
2. Create a mapping between first input field and first output field
3. Verify the first mapping is created
4. Create a mapping between second input field and second output field
5. Verify the second mapping is created
6. Verify both mappings are visible in the inline editor
7. Verify the expression bar updates to show the current mapping
8. Verify multiple mapping links are displayed
9. **Verify the source generated:**
    - Verify all mappings are included in the generated expression
    - Verify the expression correctly maps all input fields to output fields
10. **Verify the diagram:**
    - Verify all mapping links are visually displayed
    - Verify the mapping structure is correctly represented

---

### 4. Delete mapping (Description: Remove mapping link)

**Steps:**
1. Open an inline data mapper with existing mappings
2. Verify mapping links are visible
3. Select a mapping link or mapped output field
4. Locate the delete mapping button/action (e.g., context menu, delete icon)
5. Click on the delete mapping button/action
6. Verify the mapping link is removed
7. Verify the output field no longer shows the mapped value indicator
8. Verify the expression bar is cleared or updated
9. **Verify the source generated:**
    - Verify the mapping expression is removed from the variable declaration
    - Verify the source code no longer includes the deleted mapping
10. **Verify the diagram:**
    - Verify the mapping link is removed from the visual representation
    - Verify the field relationship is correctly updated

---

### 5. Expression bar editing (Description: Edit expression via expression bar)

**Steps:**
1. Open an inline data mapper with an existing mapping
2. Verify the expression bar is visible
3. Verify the expression bar shows the current mapping expression
4. Select a mapped output field
5. Verify the expression bar displays the current mapping expression
6. Click on the expression input field in the expression bar
7. Edit the expression (e.g., add a function call, modify the mapping)
8. Verify expression completions appear as you type
9. Verify the expression syntax is validated
10. Click on the "Save" button (✓ icon) in the expression bar
11. Verify the expression is saved
12. Verify the mapping is updated in the inline editor
13. **Verify the source generated:**
    - Verify the updated expression is reflected in the variable declaration
    - Verify the source code includes the modified expression
14. **Verify the diagram:**
    - Verify the mapping link reflects the updated expression
    - Verify the field relationship is correctly represented

---

### 6. Expression completions (Description: Verify completions appear)

**Steps:**
1. Open an inline data mapper editor
2. Select an output field
3. Click on the expression input field in the expression bar
4. Start typing an expression (e.g., type a function name or field name)
5. Verify expression completions appear in a dropdown
6. Verify completions include:
   - Available input variable names
   - Function names
   - Built-in functions
   - Type-specific functions
   - Flow context variables
7. Use arrow keys to navigate through completions
8. Press Enter or click to select a completion
9. Verify the selected completion is inserted into the expression
10. **Verify the source generated:**
    - Verify the completed expression is valid
    - Verify the source code includes the completed expression correctly
11. **Verify the diagram:**
    - Verify the expression bar displays the completed expression
    - Verify the mapping is correctly represented

---

### 7. Convert to query (Description: Convert mapping to query expression)

**Steps:**
1. Open an inline data mapper with existing mappings
2. Verify the "Convert to Query" button/option is available
3. Click on the "Convert to Query" button/option
4. Verify the mapping is converted to a query expression format
5. Verify the expression bar displays the query expression
6. Verify query-specific elements are shown (e.g., from clause, select clause)
7. **Verify the source generated:**
    - Verify the variable declaration uses query expression syntax
    - Verify the query expression is correctly generated
8. **Verify the diagram:**
    - Verify the mapping is represented as a query expression
    - Verify query visualization is correctly displayed

---

### 8. Add query clauses (Description: Add from/where/let clauses)

**Steps:**
1. Open an inline data mapper with a query expression
2. Verify query clauses section is visible
3. Click on "Add Clause" button or similar action
4. Verify a clause type selector appears (from/where/let)
5. Select a clause type (e.g., "where")
6. Verify the clause is added to the query
7. Verify the clause editor/input is visible
8. Enter clause expression (e.g., where condition)
9. Verify the clause is saved
10. Repeat steps 3-9 to add multiple clauses
11. **Verify the source generated:**
    - Verify all query clauses are included in the variable declaration
    - Verify the query expression syntax is correct
12. **Verify the diagram:**
    - Verify all query clauses are visually represented
    - Verify the query structure is correctly displayed

---

### 9. Create sub-mapping (Description: Add sub-mapping)

**Steps:**
1. Open an inline data mapper with complex input/output fields (e.g., nested records, arrays)
2. Select a complex output field that requires sub-mapping
3. Verify the "Add Sub Mapping" button is visible
4. Click on the "Add Sub Mapping" button
5. Verify the sub-mapping view opens
6. Verify the sub-mapping shows the complex field structure
7. Verify input fields are available for mapping
8. Create mappings within the sub-mapping view
9. **Verify the source generated:**
    - Verify the sub-mapping expression is generated correctly
    - Verify the sub-mapping is included in the variable declaration
10. **Verify the diagram:**
    - Verify the sub-mapping view is correctly displayed
    - Verify navigation to sub-mapping works correctly

---

### 10. Navigate sub-mapping (Description: Navigate into and out of sub-mapping)

**Steps:**
1. Open an inline data mapper with a field that has a sub-mapping
2. Verify the sub-mapping indicator is visible on the field
3. Click on the sub-mapping indicator or "Enter Sub Mapping" action
4. Verify the sub-mapping view opens
5. Verify the breadcrumb shows the navigation path
6. Verify the sub-mapping editor is displayed
7. Verify input and output fields for the sub-mapping are visible
8. Create mappings within the sub-mapping
9. Click on the parent level in the breadcrumb to navigate back
10. Verify navigation returns to the parent inline data mapper view
11. Verify the parent mappings are visible
12. Verify the sub-mapping is still intact
13. **Verify the source generated:**
    - Verify the sub-mapping source code is accessible
    - Verify the sub-mapping function/expression is correctly defined
    - Verify the parent expression includes the sub-mapping
14. **Verify the diagram:**
    - Verify the sub-mapping view is correctly displayed
    - Verify navigation between parent and sub-mapping works correctly

---

### 11. Array mapping (Description: Map arrays in inline context)

**Steps:**
1. Open an inline data mapper with array input and array output fields
2. Verify the input section shows an array field (e.g., from an input variable)
3. Verify the output section shows an array field (e.g., in the variable type)
4. Select the input array field
5. Map it to the output array field
6. Verify a mapping link is created between the arrays
7. Verify the expression bar displays the array mapping expression
8. **Verify the source generated:**
    - Verify the array mapping expression is generated correctly in the variable declaration
    - Verify the expression uses array mapping syntax (e.g., map function, query expression)
9. **Verify the diagram:**
    - Verify the array mapping link is visually displayed
    - Verify the array relationship is correctly represented

---

### 12. Map with custom function (Description: Apply custom function in inline context)

**Steps:**
1. Open an inline data mapper with input and output fields
2. Select an output field
3. Verify the expression bar is visible
4. Start typing a custom function name in the expression bar
5. Verify the custom function appears in completions (if available in project)
6. Select the custom function from completions
7. Verify the function is inserted into the expression
8. Complete the expression with function parameters
9. Save the expression
10. **Verify the source generated:**
    - Verify the custom function call is included in the variable declaration
    - Verify the function import is added (if needed)
    - Verify the function call syntax is correct
11. **Verify the diagram:**
    - Verify the mapping expression includes the custom function
    - Verify the field relationship is correctly represented

---

### 13. Auto map with AI (Description: Click Auto Map button in inline context)

**Steps:**
1. Open an inline data mapper with input and output fields defined
2. Verify the "Auto Map" button is visible in the toolbar
3. Click on the "Auto Map" button
4. Verify the auto-mapping process starts (loading indicator may appear)
5. Wait for the auto-mapping to complete
6. Verify mappings are automatically created between matching input and output fields
7. Verify mapping links are displayed
8. Verify the expression bar shows the generated expressions
9. **Verify the source generated:**
    - Verify the auto-generated mappings are included in the variable declaration
    - Verify the expressions are correctly generated
10. **Verify the diagram:**
    - Verify all auto-generated mapping links are visually displayed
    - Verify the mapping structure is correctly represented

---

### 14. Close inline data mapper (Description: Close and return to flow diagram)

**Steps:**
1. Open an inline data mapper from a variable declaration node
2. Verify the "Close" button (✕ icon) is visible
3. Make some changes to the inline data mapper (optional)
4. Click on the "Close" button
5. Verify the inline data mapper closes
6. Verify navigation returns to the flow diagram
7. Verify the variable declaration node shows the updated expression (if saved)
8. Verify unsaved changes are preserved or prompted for save (depending on implementation)
9. **Verify the source generated:**
    - Verify the source code reflects any saved changes
    - Verify the variable declaration includes the data mapper expression
10. **Verify the diagram:**
    - Verify the variable declaration node is correctly displayed
    - Verify navigation back to the inline data mapper works correctly

---

