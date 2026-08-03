# Reusable Data Mapper - Test Specification

## Application Overview

The Reusable Data Mapper feature in WSO2 Integrator: BI allows users to create reusable data transformation functions that can be called from flow diagrams. Users can define input parameters and output types, create field mappings between input and output structures, edit expressions, convert mappings to query expressions, create sub-mappings for complex fields, and use AI-powered auto-mapping. Data mappers are created as standalone artifacts and can be invoked from DATA_MAPPER_CALL nodes in flow diagrams.

## UI Elements Identified

### Buttons and Actions
- **Add Artifact** button (text: "Add Artifact", icon: ➕) - in Project Explorer
- **Data Mapper** option - in "Other Artifacts" section
- **Create** button (text: "Create") - in data mapper creation form
- **Edit** button (text: "Edit", icon: ✏️) - in data mapper header toolbar
- **Auto Map** button (text: "Auto Map", icon: 🤖) - in data mapper header toolbar
- **Undo** button (icon: ↶) - in data mapper header toolbar
- **Redo** button (icon: ↷) - in data mapper header toolbar
- **Close** button (icon: ✕) - in data mapper header toolbar
- **Show Source** button (text: "Show Source", icon: 📄) - in editor toolbar
- **Add Sub Mapping** button (text: "Add Sub Mapping", icon: ➕) - in input/output field sections
- **Save** button/action - for saving expression edits
- **Convert to Query** button/action - for converting mapping to query expression
- **Add Clause** button/action - for adding query clauses (from/where/let)
- **Delete Clause** button/action - for removing query clauses
- **Delete Mapping** button/action - for removing mapping links
- **Refresh** button/action - for reloading data mapper model
- **Reset** button/action - for clearing all mappings

### Form Fields
- **Data Mapper Name*** textbox (required)
  - Description: "Name of the data mapper"
  - Default value: "transform"
- **Inputs*** section (required)
  - Description: "Input variables of the data mapper"
  - **Add Input** button - for adding input parameters
  - Input parameter form:
    - **Name*** textbox (required)
    - **Type*** selector (required)
- **Output*** section (required)
  - Description: "Output type of the data mapper"
  - **Output type** selector (required)
  - Default value: "anydata"

### Data Mapper Editor Elements
- **Data Mapper Function** header - displays function name
- **Search field** - with placeholder "filter input and output fields"
- **Input section** - displays input parameters with types
  - Field items showing parameter name and type
  - Expand/collapse icons for nested structures
  - Field selection indicators
- **Output section** - displays output type and mapped fields
  - Field items showing field name and type
  - Expand/collapse icons for nested structures
  - Mapped field indicators
- **Expression bar** - for editing mapping expressions
  - Text field for expression input
  - "No field selected" placeholder when no field is selected
  - Expression completion support
  - Save button (icon: ✓)
- **Mapping links** - visual connections between input and output fields
- **Sub-mapping indicators** - shows when a field has sub-mappings
- **Breadcrumb navigation** - for navigating sub-mappings

### Navigation Elements
- **Breadcrumbs** showing: Overview > Artifacts > Data Mapper
- **Project Explorer** - Data Mappers category
- **DATA_MAPPER_CALL node** - in flow diagrams for calling data mappers
- **View menu** - on DATA_MAPPER_CALL node for opening data mapper
- **Cmd+Click** - shortcut for opening data mapper from call node

## Missing Test IDs Recommendations

The following test IDs should be added for better testability:

1. `data-testid="add-artifact-button"`
2. `data-testid="data-mapper-option"`
3. `data-testid="data-mapper-name-input"`
4. `data-testid="add-input-button"`
5. `data-testid="input-name-input"`
6. `data-testid="input-type-selector"`
7. `data-testid="output-type-selector"`
8. `data-testid="create-data-mapper-button"`
9. `data-testid="data-mapper-editor"`
10. `data-testid="edit-data-mapper-button"`
11. `data-testid="auto-map-button"`
12. `data-testid="undo-button"`
13. `data-testid="redo-button"`
14. `data-testid="search-fields-input"`
15. `data-testid="expression-bar"`
16. `data-testid="expression-input"`
17. `data-testid="save-expression-button"`
18. `data-testid="input-field-[FieldName]"`
19. `data-testid="output-field-[FieldName]"`
20. `data-testid="mapping-link-[InputField]-[OutputField]"`
21. `data-testid="delete-mapping-button"`
22. `data-testid="add-sub-mapping-button"`
23. `data-testid="convert-to-query-button"`
24. `data-testid="add-clause-button"`
25. `data-testid="delete-clause-button"`
26. `data-testid="refresh-data-mapper-button"`
27. `data-testid="reset-mappings-button"`
28. `data-testid="data-mapper-call-node"`
29. `data-testid="open-data-mapper-from-call-button"`

## Test Scenarios

### 1. Create data mapper from Project Explorer (Description: Create new reusable data mapper from Data Mappers category)

**Steps:**
1. Navigate to WSO2 Integrator: BI view
2. Verify the Project Explorer is visible
3. Locate the "Data Mappers" category in the Project Explorer (or "Other Artifacts" section)
4. Click on "Add Artifact" button
5. Verify the artifact creation menu opens
6. Click on "Data Mapper" option in "Other Artifacts" section
7. Verify the "Create New Data Mapper" form opens
8. Verify the heading "Create New Data Mapper" is displayed
9. Verify the description "Create mappings on how to convert the inputs into a single output" is shown
10. Verify the "Data Mapper Name" field is visible with default value "transform"
11. Verify the "Inputs" section is visible with "Add Input" button
12. Verify the "Output" section is visible with output type selector
13. **Verify the source generated:**
    - Verify the data mapper function is created in source code
    - Verify the function signature matches the configured inputs and output
14. **Verify the diagram:**
    - Verify the data mapper appears in the Project Explorer
    - Verify navigation to the data mapper editor works correctly

---

### 2. Open data mapper from Project Explorer (Description: Click data mapper in Project Explorer to open)

**Steps:**
1. Navigate to Project Explorer
2. Verify the "Data Mappers" category is visible
3. Verify existing data mappers are listed under "Data Mappers"
4. Click on a data mapper name (e.g., "transform")
5. Verify the data mapper editor opens
6. Verify the data mapper function name is displayed in the header
7. Verify the input and output sections are visible
8. Verify the expression bar is visible
9. Verify the toolbar buttons (Edit, Auto Map, Undo, Redo, Close) are visible
10. **Verify the source generated:**
    - Verify the data mapper source code is correctly loaded
    - Verify the function definition matches the editor view
11. **Verify the diagram:**
    - Verify the data mapper editor displays the correct mapping structure
    - Verify field relationships are correctly visualized

---

### 3. Configure function inputs (Description: Add input parameters via function form)

**Steps:**
1. Open the data mapper creation form
2. Verify the "Inputs" section is visible
3. Click on "Add Input" button
4. Verify the "Add Input" form opens
5. Enter an input parameter name (e.g., "inputData") in the "Name" field
6. Click on the "Type" selector
7. Verify the type browser opens
8. Select a type (e.g., "string") from the type browser
9. Click on "Add" button
10. Verify the input parameter is added to the "Inputs" section
11. Verify the input parameter displays with name and type
12. Repeat steps 3-11 to add multiple input parameters
13. **Verify the source generated:**
    - Verify the function signature includes all input parameters
    - Verify parameter types are correctly specified in source code
14. **Verify the diagram:**
    - Verify input parameters appear in the data mapper editor input section
    - Verify input fields are expandable for complex types

---

### 4. Configure function output (Description: Set return type via function form)

**Steps:**
1. Open the data mapper creation form
2. Verify the "Output" section is visible
3. Verify the output type selector shows default value "anydata"
4. Click on the output type selector
5. Verify the type browser opens
6. Select a type (e.g., "string", "json", or a record type) from the type browser
7. Verify the selected type is displayed in the output type selector
8. Verify the "Create" button becomes enabled (if it was disabled)
9. **Verify the source generated:**
    - Verify the function return type is correctly specified in source code
    - Verify the return type matches the selected type
10. **Verify the diagram:**
    - Verify the output section displays the selected output type
    - Verify output fields are expandable for complex types

---

### 5. Edit data mapper definition (Description: Click Edit button to modify inputs/outputs)

**Steps:**
1. Open an existing data mapper in the editor
2. Verify the "Edit" button is visible in the header toolbar
3. Click on the "Edit" button
4. Verify the data mapper definition form opens
5. Verify the current data mapper name is displayed
6. Verify the current inputs are listed
7. Verify the current output type is displayed
8. Modify the data mapper name (if needed)
9. Add a new input parameter using "Add Input" button
10. Modify the output type using the output type selector
11. Click on "Save" or "Update" button (if available)
12. Verify the changes are saved
13. Verify the data mapper editor reflects the updated definition
14. **Verify the source generated:**
    - Verify the function signature is updated with new inputs/output
    - Verify the source code reflects all changes
15. **Verify the diagram:**
    - Verify the data mapper editor displays updated inputs and output
    - Verify existing mappings are preserved (if compatible)

---

### 6. Simple field mapping (Description: Drag from input to output field)

**Steps:**
1. Open a data mapper with input and output fields
2. Verify the input section displays input fields
3. Verify the output section displays output fields
4. Select an input field (e.g., "inputData" of type string)
5. Drag the input field to a corresponding output field (e.g., "transform" of type string)
6. Verify a mapping link is created between the input and output fields
7. Verify the output field shows the mapped value indicator
8. Verify the expression bar displays the mapping expression
9. **Verify the source generated:**
    - Verify the mapping expression is generated in the function body
    - Verify the expression correctly maps input to output field
10. **Verify the diagram:**
    - Verify the mapping link is visually displayed
    - Verify the field relationship is correctly represented

---

### 7. Multiple field mappings (Description: Create multiple mappings)

**Steps:**
1. Open a data mapper with multiple input and output fields
2. Create a mapping between first input field and first output field
3. Verify the first mapping is created
4. Create a mapping between second input field and second output field
5. Verify the second mapping is created
6. Verify both mappings are visible in the editor
7. Verify the expression bar updates to show the current mapping
8. Verify multiple mapping links are displayed
9. **Verify the source generated:**
    - Verify all mappings are included in the generated expression
    - Verify the expression correctly maps all input fields to output fields
10. **Verify the diagram:**
    - Verify all mapping links are visually displayed
    - Verify the mapping structure is correctly represented

---

### 8. Delete mapping (Description: Remove a mapping link)

**Steps:**
1. Open a data mapper with existing mappings
2. Verify mapping links are visible
3. Select a mapping link or mapped output field
4. Locate the delete mapping button/action (e.g., context menu, delete icon)
5. Click on the delete mapping button/action
6. Verify the mapping link is removed
7. Verify the output field no longer shows the mapped value indicator
8. Verify the expression bar is cleared or updated
9. **Verify the source generated:**
    - Verify the mapping expression is removed from the function body
    - Verify the source code no longer includes the deleted mapping
10. **Verify the diagram:**
    - Verify the mapping link is removed from the visual representation
    - Verify the field relationship is correctly updated

---

### 9. Nested field mapping (Description: Map between nested structures)

**Steps:**
1. Open a data mapper with nested input and output structures (e.g., record types)
2. Verify the input section shows expandable nested fields
3. Expand the input structure to reveal nested fields
4. Verify the output section shows expandable nested fields
5. Expand the output structure to reveal nested fields
6. Select a nested input field (e.g., "person.name")
7. Drag or map it to a corresponding nested output field (e.g., "employee.fullName")
8. Verify a mapping link is created between the nested fields
9. Verify the expression bar displays the nested field mapping expression
10. **Verify the source generated:**
    - Verify the nested field mapping expression is generated correctly
    - Verify the expression uses proper field access syntax (e.g., dot notation)
11. **Verify the diagram:**
    - Verify the nested mapping link is visually displayed
    - Verify the nested field relationship is correctly represented

---

### 10. Expression bar editing (Description: Edit expression via expression bar)

**Steps:**
1. Open a data mapper with an existing mapping
2. Verify the expression bar is visible
3. Verify the expression bar shows "No field selected" or the current mapping expression
4. Select a mapped output field
5. Verify the expression bar displays the current mapping expression
6. Click on the expression input field in the expression bar
7. Edit the expression (e.g., add a function call, modify the mapping)
8. Verify expression completions appear as you type
9. Verify the expression syntax is validated
10. Click on the "Save" button (✓ icon) in the expression bar
11. Verify the expression is saved
12. Verify the mapping is updated in the editor
13. **Verify the source generated:**
    - Verify the updated expression is reflected in the function body
    - Verify the source code includes the modified expression
14. **Verify the diagram:**
    - Verify the mapping link reflects the updated expression
    - Verify the field relationship is correctly represented

---

### 11. Expression completions (Description: Verify completions appear)

**Steps:**
1. Open a data mapper editor
2. Select an output field
3. Click on the expression input field in the expression bar
4. Start typing an expression (e.g., type a function name or field name)
5. Verify expression completions appear in a dropdown
6. Verify completions include:
   - Input field names
   - Function names
   - Built-in functions
   - Type-specific functions
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

### 12. Save expression (Description: Save modified expression)

**Steps:**
1. Open a data mapper with an existing mapping
2. Select a mapped output field
3. Verify the expression bar displays the current expression
4. Edit the expression in the expression bar
5. Verify the expression input field shows the modified expression
6. Click on the "Save" button (✓ icon) in the expression bar
7. Verify the expression is saved
8. Verify the mapping is updated
9. Verify the expression bar shows the saved expression
10. **Verify the source generated:**
    - Verify the saved expression is reflected in the function body
    - Verify the source code is updated with the new expression
11. **Verify the diagram:**
    - Verify the mapping link reflects the saved expression
    - Verify the field relationship is correctly updated

---

### 13. Convert to query (Description: Convert mapping to query expression)

**Steps:**
1. Open a data mapper with existing mappings
2. Verify the "Convert to Query" button/option is available
3. Click on the "Convert to Query" button/option
4. Verify the mapping is converted to a query expression format
5. Verify the expression bar displays the query expression
6. Verify query-specific elements are shown (e.g., from clause, select clause)
7. **Verify the source generated:**
    - Verify the function body uses query expression syntax
    - Verify the query expression is correctly generated
8. **Verify the diagram:**
    - Verify the mapping is represented as a query expression
    - Verify query visualization is correctly displayed

---

### 14. Add query clauses (Description: Add from/where/let clauses)

**Steps:**
1. Open a data mapper with a query expression
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
    - Verify all query clauses are included in the function body
    - Verify the query expression syntax is correct
12. **Verify the diagram:**
    - Verify all query clauses are visually represented
    - Verify the query structure is correctly displayed

---

### 15. Delete query clause (Description: Remove clause from query)

**Steps:**
1. Open a data mapper with a query expression containing multiple clauses
2. Verify the query clauses are listed
3. Locate a clause to delete (e.g., a where clause)
4. Click on the delete button/action for the clause
5. Verify a confirmation dialog appears (if applicable)
6. Confirm the deletion
7. Verify the clause is removed from the query
8. Verify the expression bar is updated
9. **Verify the source generated:**
    - Verify the deleted clause is removed from the function body
    - Verify the query expression is still valid
10. **Verify the diagram:**
    - Verify the clause is removed from the visual representation
    - Verify the query structure is correctly updated

---

### 16. Create sub-mapping (Description: Add sub-mapping for complex field)

**Steps:**
1. Open a data mapper with complex input/output fields (e.g., nested records, arrays)
2. Select a complex output field that requires sub-mapping
3. Verify the "Add Sub Mapping" button is visible
4. Click on the "Add Sub Mapping" button
5. Verify the sub-mapping view opens
6. Verify the sub-mapping shows the complex field structure
7. Verify input fields are available for mapping
8. Create mappings within the sub-mapping view
9. **Verify the source generated:**
    - Verify the sub-mapping expression is generated correctly
    - Verify the sub-mapping is included in the main function body
10. **Verify the diagram:**
    - Verify the sub-mapping view is correctly displayed
    - Verify navigation to sub-mapping works correctly

---

### 17. Navigate into sub-mapping (Description: Enter sub-mapping view)

**Steps:**
1. Open a data mapper with a field that has a sub-mapping
2. Verify the sub-mapping indicator is visible on the field
3. Click on the sub-mapping indicator or "Enter Sub Mapping" action
4. Verify the sub-mapping view opens
5. Verify the breadcrumb shows the navigation path
6. Verify the sub-mapping editor is displayed
7. Verify input and output fields for the sub-mapping are visible
8. **Verify the source generated:**
    - Verify the sub-mapping source code is accessible
    - Verify the sub-mapping function/expression is correctly defined
9. **Verify the diagram:**
    - Verify the sub-mapping view is correctly displayed
    - Verify the sub-mapping structure is visually represented

---

### 18. Navigate back via breadcrumb (Description: Return to parent view)

**Steps:**
1. Navigate into a sub-mapping view
2. Verify the breadcrumb navigation is visible
3. Verify the breadcrumb shows the current location (e.g., "transform > nestedField")
4. Click on the parent level in the breadcrumb (e.g., "transform")
5. Verify navigation returns to the parent data mapper view
6. Verify the parent mappings are visible
7. Verify the sub-mapping is still intact
8. **Verify the source generated:**
    - Verify the parent function source code is accessible
    - Verify the sub-mapping is correctly referenced in the parent
9. **Verify the diagram:**
    - Verify the parent view is correctly displayed
    - Verify navigation between parent and sub-mapping works correctly

---

### 19. Array to array mapping (Description: Map array input to array output)

**Steps:**
1. Open a data mapper with array input and array output fields
2. Verify the input section shows an array field (e.g., "items: string[]")
3. Verify the output section shows an array field (e.g., "products: string[]")
4. Select the input array field
5. Map it to the output array field
6. Verify a mapping link is created between the arrays
7. Verify the expression bar displays the array mapping expression
8. **Verify the source generated:**
    - Verify the array mapping expression is generated correctly
    - Verify the expression uses array mapping syntax (e.g., map function, query expression)
9. **Verify the diagram:**
    - Verify the array mapping link is visually displayed
    - Verify the array relationship is correctly represented

---

### 20. Map with custom function (Description: Apply custom function to mapping)

**Steps:**
1. Open a data mapper with input and output fields
2. Select an output field
3. Verify the expression bar is visible
4. Start typing a custom function name in the expression bar
5. Verify the custom function appears in completions (if available in project)
6. Select the custom function from completions
7. Verify the function is inserted into the expression
8. Complete the expression with function parameters
9. Save the expression
10. **Verify the source generated:**
    - Verify the custom function call is included in the function body
    - Verify the function import is added (if needed)
    - Verify the function call syntax is correct
11. **Verify the diagram:**
    - Verify the mapping expression includes the custom function
    - Verify the field relationship is correctly represented

---

### 21. Auto map with AI (Description: Click Auto Map button)

**Steps:**
1. Open a data mapper with input and output fields defined
2. Verify the "Auto Map" button is visible in the header toolbar
3. Click on the "Auto Map" button
4. Verify the auto-mapping process starts (loading indicator may appear)
5. Wait for the auto-mapping to complete
6. Verify mappings are automatically created between matching input and output fields
7. Verify mapping links are displayed
8. Verify the expression bar shows the generated expressions
9. **Verify the source generated:**
    - Verify the auto-generated mappings are included in the function body
    - Verify the expressions are correctly generated
10. **Verify the diagram:**
    - Verify all auto-generated mapping links are visually displayed
    - Verify the mapping structure is correctly represented

---

### 22. Search fields (Description: Filter fields using search box)

**Steps:**
1. Open a data mapper with multiple input and output fields
2. Verify the search field is visible with placeholder "filter input and output fields"
3. Type a search term in the search field (e.g., "name")
4. Verify the input and output sections are filtered to show only matching fields
5. Verify fields matching the search term are highlighted or visible
6. Verify fields not matching the search term are hidden or collapsed
7. Clear the search field
8. Verify all fields are visible again
9. **Verify the source generated:**
    - Verify searching does not affect the source code
    - Verify all fields remain available for mapping
10. **Verify the diagram:**
    - Verify the search filter correctly updates the field display
    - Verify field visibility is correctly managed

---

### 23. Undo/Redo mapping (Description: Undo and redo operations)

**Steps:**
1. Open a data mapper editor
2. Create a mapping between input and output fields
3. Verify the mapping is created
4. Click on the "Undo" button (↶ icon) in the header toolbar
5. Verify the last mapping operation is undone
6. Verify the mapping link is removed
7. Click on the "Redo" button (↷ icon) in the header toolbar
8. Verify the mapping operation is redone
9. Verify the mapping link is restored
10. Perform multiple operations (add mappings, edit expressions)
11. Use Undo multiple times to revert operations
12. Use Redo to restore operations
13. **Verify the source generated:**
    - Verify Undo/Redo correctly updates the source code
    - Verify the function body reflects the current state
14. **Verify the diagram:**
    - Verify Undo/Redo correctly updates the visual representation
    - Verify the mapping structure reflects the current state

---

### 24. Refresh data mapper (Description: Click refresh to reload model)

**Steps:**
1. Open a data mapper editor
2. Verify the "Refresh" button/action is available
3. Make note of the current mappings
4. Click on the "Refresh" button
5. Verify the data mapper model is reloaded
6. Verify the current mappings are preserved
7. Verify the input and output fields are refreshed
8. Verify any external type changes are reflected
9. **Verify the source generated:**
    - Verify the refreshed model matches the source code
    - Verify the function definition is correctly loaded
10. **Verify the diagram:**
    - Verify the refreshed model is correctly displayed
    - Verify the mapping structure is correctly represented

---

### 25. Reset all mappings (Description: Clear all mappings)

**Steps:**
1. Open a data mapper with existing mappings
2. Verify multiple mappings are present
3. Locate the "Reset" or "Clear All Mappings" button/action
4. Click on the "Reset" button
5. Verify a confirmation dialog appears (if applicable)
6. Confirm the reset action
7. Verify all mappings are cleared
8. Verify all mapping links are removed
9. Verify the expression bar is cleared
10. **Verify the source generated:**
    - Verify all mapping expressions are removed from the function body
    - Verify the function returns a default/empty value
11. **Verify the diagram:**
    - Verify all mapping links are removed from the visual representation
    - Verify the data mapper editor shows no mappings

---

### 26. Close data mapper (Description: Close and return to previous view)

**Steps:**
1. Open a data mapper editor
2. Verify the "Close" button (✕ icon) is visible in the header toolbar
3. Make some changes to the data mapper (optional)
4. Click on the "Close" button
5. Verify the data mapper editor closes
6. Verify navigation returns to the previous view (e.g., Project Explorer, flow diagram)
7. Verify unsaved changes are preserved or prompted for save (depending on implementation)
8. **Verify the source generated:**
    - Verify the source code reflects any saved changes
    - Verify the function definition is correctly saved
9. **Verify the diagram:**
    - Verify the data mapper is accessible from Project Explorer
    - Verify navigation back to the data mapper works correctly

---

### 27. Verify generated code (Description: Check generated expression-bodied function)

**Steps:**
1. Open a data mapper with completed mappings
2. Create multiple field mappings
3. Add expressions with functions
4. Create sub-mappings if applicable
5. Click on the "Show Source" button in the editor toolbar
6. Verify the source code view opens
7. Verify the generated function is displayed
8. Verify the function signature matches the configured inputs and output
9. Verify the function body contains the mapping expressions
10. Verify the expressions are correctly formatted
11. Verify the function is an expression-bodied function (if applicable)
12. **Verify the source generated:**
    - Verify the function compiles without errors
    - Verify the function logic matches the mappings
13. **Verify the diagram:**
    - Verify the source code view is accessible from the diagram
    - Verify navigation between source and diagram works correctly

---

### 28. Call data mapper from flow (Description: Use DATA_MAPPER_CALL node in diagram)

**Steps:**
1. Open a flow diagram editor
2. Verify the node palette or "Add Node" option is available
3. Add a "DATA_MAPPER_CALL" node to the diagram
4. Verify the DATA_MAPPER_CALL node is added to the diagram
5. Click on the DATA_MAPPER_CALL node to configure it
6. Verify the node configuration form opens
7. Verify a data mapper selector is available
8. Select a data mapper from the list (e.g., "transform")
9. Verify the selected data mapper is displayed
10. Verify input/output connections are available
11. Connect input variables to the data mapper inputs
12. Connect the data mapper output to downstream nodes
13. **Verify the source generated:**
    - Verify the DATA_MAPPER_CALL node generates the correct function call
    - Verify the function call syntax is correct
14. **Verify the diagram:**
    - Verify the DATA_MAPPER_CALL node is correctly displayed
    - Verify the connections are visually represented

---

### 29. Open data mapper from call node (Description: Cmd+click or View menu on call node)

**Steps:**
1. Open a flow diagram with a DATA_MAPPER_CALL node
2. Verify the DATA_MAPPER_CALL node is visible in the diagram
3. Method 1: Press Cmd+Click (or Ctrl+Click) on the DATA_MAPPER_CALL node
4. Method 2: Right-click on the DATA_MAPPER_CALL node to open context menu
5. Verify the context menu shows "View Data Mapper" or similar option
6. Click on "View Data Mapper" option
7. Verify the data mapper editor opens
8. Verify the data mapper function is displayed
9. Verify the mappings are visible
10. **Verify the source generated:**
    - Verify the data mapper source code is accessible
    - Verify the function definition matches the call node configuration
11. **Verify the diagram:**
    - Verify navigation from call node to data mapper works correctly
    - Verify returning to the flow diagram works correctly

---

