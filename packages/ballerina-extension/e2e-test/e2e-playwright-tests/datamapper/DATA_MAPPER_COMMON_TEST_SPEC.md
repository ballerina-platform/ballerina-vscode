# Data Mapper Common - Test Specification

## Application Overview

This document covers common test scenarios that apply to both Reusable Data Mapper and Inline Data Mapper features in WSO2 Integrator: BI. These scenarios test shared functionality, UI elements, and behaviors that are consistent across both data mapper types.

## Common UI Elements

### Shared Buttons and Actions
- **Auto Map** button (text: "Auto Map", icon: 🤖)
- **Undo** button (icon: ↶)
- **Redo** button (icon: ↷)
- **Expression bar** with text input and save button
- **Add Sub Mapping** button (text: "Add Sub Mapping", icon: ➕)
- **Convert to Query** button/action
- **Add Clause** button/action (for query expressions)
- **Delete Clause** button/action
- **Delete Mapping** button/action
- **Close** button (icon: ✕)

### Shared Form Elements
- **Input section** - displays input fields/variables
- **Output section** - displays output fields
- **Expression bar** - for editing mapping expressions
- **Search field** - for filtering fields (in reusable data mapper)
- **Mapping links** - visual connections between fields
- **Sub-mapping indicators** - shows nested mappings
- **Breadcrumb navigation** - for sub-mapping navigation

## Missing Test IDs Recommendations

The following test IDs should be added for better testability (applies to both reusable and inline data mappers):

1. `data-testid="data-mapper-expression-bar"`
2. `data-testid="data-mapper-expression-input"`
3. `data-testid="data-mapper-save-expression-button"`
4. `data-testid="data-mapper-auto-map-button"`
5. `data-testid="data-mapper-undo-button"`
6. `data-testid="data-mapper-redo-button"`
7. `data-testid="data-mapper-add-sub-mapping-button"`
8. `data-testid="data-mapper-convert-to-query-button"`
9. `data-testid="data-mapper-mapping-link"`
10. `data-testid="data-mapper-delete-mapping-button"`
11. `data-testid="data-mapper-sub-mapping-indicator"`
12. `data-testid="data-mapper-breadcrumb"`

## Test Scenarios

### 1. Expression bar functionality (Description: Common expression editing across both data mapper types)

**Steps:**
1. Open either a reusable or inline data mapper
2. Verify the expression bar is visible
3. Select an output field
4. Verify the expression bar displays the current mapping expression (or "No field selected")
5. Click on the expression input field
6. Type or edit the expression
7. Verify expression completions appear
8. Verify expression syntax validation works
9. Click on the "Save" button (✓ icon)
10. Verify the expression is saved
11. Verify the mapping is updated
12. **Verify the source generated:**
    - Verify the expression is correctly included in the generated source code
    - Verify the expression syntax is valid
13. **Verify the diagram:**
    - Verify the expression is correctly represented in the visual mapping
    - Verify the field relationship reflects the expression

---

### 2. Expression completions (Description: Verify completions work in both data mapper types)

**Steps:**
1. Open either a reusable or inline data mapper
2. Select an output field
3. Click on the expression input field in the expression bar
4. Start typing an expression
5. Verify expression completions appear in a dropdown
6. Verify completions include:
   - Input field/variable names
   - Function names
   - Built-in functions
   - Type-specific functions
7. Use arrow keys to navigate completions
8. Press Enter or click to select a completion
9. Verify the completion is inserted
10. **Verify the source generated:**
    - Verify the completed expression is valid
    - Verify the source code includes the completed expression
11. **Verify the diagram:**
    - Verify the expression bar shows the completed expression
    - Verify the mapping is correctly represented

---

### 3. Convert to query expression (Description: Convert mapping to query in both data mapper types)

**Steps:**
1. Open either a reusable or inline data mapper with existing mappings
2. Verify the "Convert to Query" button/option is available
3. Click on the "Convert to Query" button/option
4. Verify the mapping is converted to query expression format
5. Verify the expression bar displays the query expression
6. Verify query-specific elements are shown (from, select, where, let clauses)
7. **Verify the source generated:**
    - Verify the function body or variable declaration uses query expression syntax
    - Verify the query expression is correctly generated
8. **Verify the diagram:**
    - Verify the mapping is represented as a query expression
    - Verify query visualization is correctly displayed

---

### 4. Sub-mapping navigation (Description: Navigate sub-mappings in both data mapper types)

**Steps:**
1. Open either a reusable or inline data mapper with a complex field
2. Verify a field has a sub-mapping indicator
3. Click on the sub-mapping indicator or "Enter Sub Mapping" action
4. Verify the sub-mapping view opens
5. Verify the breadcrumb shows the navigation path
6. Verify the sub-mapping editor is displayed
7. Create or view mappings within the sub-mapping
8. Click on the parent level in the breadcrumb
9. Verify navigation returns to the parent view
10. Verify the parent mappings are visible
11. Verify the sub-mapping is preserved
12. **Verify the source generated:**
    - Verify the sub-mapping source code is accessible
    - Verify the sub-mapping is correctly referenced in the parent
13. **Verify the diagram:**
    - Verify navigation between parent and sub-mapping works correctly
    - Verify the sub-mapping structure is correctly represented

---

### 5. Undo/Redo operations (Description: Undo and redo in both data mapper types)

**Steps:**
1. Open either a reusable or inline data mapper
2. Perform a mapping operation (create mapping, edit expression)
3. Verify the operation is completed
4. Click on the "Undo" button (↶ icon)
5. Verify the last operation is undone
6. Click on the "Redo" button (↷ icon)
7. Verify the operation is redone
8. Perform multiple operations
9. Use Undo multiple times
10. Use Redo to restore operations
11. **Verify the source generated:**
    - Verify Undo/Redo correctly updates the source code
    - Verify the function body or variable declaration reflects the current state
12. **Verify the diagram:**
    - Verify Undo/Redo correctly updates the visual representation
    - Verify the mapping structure reflects the current state

---

### 6. Auto Map with AI (Description: AI-powered auto-mapping in both data mapper types)

**Steps:**
1. Open either a reusable or inline data mapper with input and output fields defined
2. Verify the "Auto Map" button is visible
3. Click on the "Auto Map" button
4. Verify the auto-mapping process starts
5. Wait for auto-mapping to complete
6. Verify mappings are automatically created between matching fields
7. Verify mapping links are displayed
8. Verify the expression bar shows generated expressions
9. **Verify the source generated:**
    - Verify auto-generated mappings are included in the source code
    - Verify expressions are correctly generated
10. **Verify the diagram:**
    - Verify all auto-generated mapping links are visually displayed
    - Verify the mapping structure is correctly represented

---

### 7. Delete mapping (Description: Remove mappings in both data mapper types)

**Steps:**
1. Open either a reusable or inline data mapper with existing mappings
2. Verify mapping links are visible
3. Select a mapping link or mapped output field
4. Locate the delete mapping button/action
5. Click on the delete mapping button/action
6. Verify the mapping link is removed
7. Verify the output field no longer shows mapped value indicator
8. Verify the expression bar is cleared or updated
9. **Verify the source generated:**
    - Verify the mapping expression is removed from the source code
    - Verify the function body or variable declaration no longer includes the mapping
10. **Verify the diagram:**
    - Verify the mapping link is removed from the visual representation
    - Verify the field relationship is correctly updated

---

### 8. Query clause management (Description: Add and delete query clauses in both data mapper types)

**Steps:**
1. Open either a reusable or inline data mapper with a query expression
2. Verify query clauses section is visible
3. Click on "Add Clause" button
4. Verify clause type selector appears (from/where/let)
5. Select a clause type
6. Verify the clause is added
7. Enter clause expression
8. Verify the clause is saved
9. Locate a clause to delete
10. Click on the delete button/action for the clause
11. Verify the clause is removed
12. **Verify the source generated:**
    - Verify all query clauses are included in the source code
    - Verify deleted clauses are removed from the source code
    - Verify query expression syntax is correct
13. **Verify the diagram:**
    - Verify query clauses are visually represented
    - Verify clause deletion updates the visual representation

---

### 9. Nested field mapping (Description: Map nested structures in both data mapper types)

**Steps:**
1. Open either a reusable or inline data mapper with nested input and output structures
2. Verify input section shows expandable nested fields
3. Expand the input structure
4. Verify output section shows expandable nested fields
5. Expand the output structure
6. Select a nested input field
7. Map it to a corresponding nested output field
8. Verify a mapping link is created
9. Verify the expression bar displays nested field mapping expression
10. **Verify the source generated:**
    - Verify nested field mapping expression is generated correctly
    - Verify expression uses proper field access syntax
11. **Verify the diagram:**
    - Verify nested mapping link is visually displayed
    - Verify nested field relationship is correctly represented

---

### 10. Array mapping (Description: Map arrays in both data mapper types)

**Steps:**
1. Open either a reusable or inline data mapper with array input and array output fields
2. Verify input section shows an array field
3. Verify output section shows an array field
4. Select the input array field
5. Map it to the output array field
6. Verify a mapping link is created
7. Verify the expression bar displays array mapping expression
8. **Verify the source generated:**
    - Verify array mapping expression is generated correctly
    - Verify expression uses array mapping syntax
9. **Verify the diagram:**
    - Verify array mapping link is visually displayed
    - Verify array relationship is correctly represented

---

### 11. Custom function mapping (Description: Apply custom functions in both data mapper types)

**Steps:**
1. Open either a reusable or inline data mapper with input and output fields
2. Select an output field
3. Start typing a custom function name in the expression bar
4. Verify custom function appears in completions (if available)
5. Select the custom function
6. Complete the expression with function parameters
7. Save the expression
8. **Verify the source generated:**
    - Verify custom function call is included in the source code
    - Verify function import is added (if needed)
    - Verify function call syntax is correct
9. **Verify the diagram:**
    - Verify mapping expression includes the custom function
    - Verify field relationship is correctly represented

---

### 12. Source code verification (Description: Verify generated source in both data mapper types)

**Steps:**
1. Open either a reusable or inline data mapper with completed mappings
2. Create multiple field mappings
3. Add expressions with functions
4. Create sub-mappings if applicable
5. Access the source code view (via "Show Source" button or similar)
6. Verify the generated source code is displayed
7. Verify the function signature or variable declaration matches the configuration
8. Verify the function body or expression contains the mapping expressions
9. Verify expressions are correctly formatted
10. **Verify the source generated:**
    - Verify the source code compiles without errors
    - Verify the source code logic matches the mappings
11. **Verify the diagram:**
    - Verify source code view is accessible from the diagram
    - Verify navigation between source and diagram works correctly

---

### 13. Diagram visualization (Description: Verify diagram representation in both data mapper types)

**Steps:**
1. Open either a reusable or inline data mapper
2. Create multiple mappings
3. Create nested mappings
4. Create array mappings
5. Verify all mapping links are visually displayed
6. Verify field relationships are correctly represented
7. Verify nested structures are expandable
8. Verify sub-mapping indicators are visible
9. **Verify the source generated:**
    - Verify the source code matches the visual representation
    - Verify all mappings are included in the source code
10. **Verify the diagram:**
    - Verify the diagram correctly represents the mapping structure
    - Verify navigation and interaction work correctly

---

### 14. Error handling (Description: Handle errors in both data mapper types)

**Steps:**
1. Open either a reusable or inline data mapper
2. Create a mapping with invalid expression syntax
3. Verify error indicators appear (e.g., red underline, error message)
4. Verify error message describes the issue
5. Correct the expression syntax
6. Verify error indicators disappear
7. Verify the mapping is valid
8. **Verify the source generated:**
    - Verify invalid expressions are not included in source code (or marked with errors)
    - Verify error messages are displayed in source code view
9. **Verify the diagram:**
    - Verify error indicators are visible in the diagram
    - Verify error messages are accessible

---

