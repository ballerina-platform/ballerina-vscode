# Type Editor - Test Specification

## Application Overview

The Type Editor feature in WSO2 Integrator: BI allows users to create, edit, and manage custom types including Record types, Enum types, Union types, Service Classes, and Array types. Types can be created from scratch or imported from JSON/XML samples. The Type Editor provides a visual diagram view and generates Ballerina source code automatically.

## UI Elements Identified

### Buttons and Actions
- **Add Artifact** button (text: "Add Artifact", icon: ➕)
- **Type** option in Artifacts menu (under "Other Artifacts" section)
- **Add Type** button (text: "Add Type", icon: ➕) - in Type Editor view
- **Create from scratch** button - in type creation dialog
- **Import** button - in type creation dialog (for JSON/XML import)
- **Save** button - in type creation/editing form
- **Close** button (icon: ✕) - to close type creation dialog
- **Add Field** button (icon: ➕) - for adding fields to Record types
- **Delete Field** button (icon: 🗑️) - for deleting fields
- **Edit Field** button (icon: ✏️) - for editing fields
- **Type Picker** button - for selecting field types
- **Advanced Options** expandable section
- **Download** button (icon: 📥) - for downloading diagram
- **Refresh** button (icon: 🔄) - for refreshing diagram
- **Zoom to fit nodes** button (icon: 🔍) - for diagram zoom
- **Zoom in** button (icon: ➕) - for diagram zoom
- **Zoom out** button (icon: ➖) - for diagram zoom

### Form Fields
- **Kind** combobox (required)
  - Options: Record, Enum, Service Class, Union, Array
  - Default: Record
- **Name** textbox (required)
  - Default: "MyType"
- **Fields** section (for Record types)
  - Field name textbox (default: "name1")
  - Field type textbox (default: "string")
  - Required/Optional toggle
  - Readonly toggle
- **Members** section (for Enum types)
  - Member name textbox
  - Add/Delete member buttons
- **Type Members** section (for Union types)
  - Type selection
  - Add/Delete type buttons
- **Advanced Options** expandable section (collapsed by default):
  - **Allow Additional Fields** checkbox (for open records)
  - **Readonly** checkbox (for making entire type readonly)

### Navigation Elements
- **Overview** breadcrumb
- **Artifacts** breadcrumb
- **Types** breadcrumb
- **Type Diagram** view
- **Type Menu** options:
  - **Focused View** option
  - **Source** option

### Diagram View Elements
- Type diagram visualization area
- Type nodes (entity-head-[TypeName])
- Type links (entity-link-[Type1]-[Type2])
- Zoom controls
- Download/Refresh buttons

## Missing Test IDs Recommendations

The following test IDs should be added for better testability:

1. `data-testid="type-option"`
2. `data-testid="add-type-button"`
3. `data-testid="create-from-scratch-button"`
4. `data-testid="import-type-button"`
5. `data-testid="type-kind-combobox"`
6. `data-testid="type-name-input"`
7. `data-testid="add-field-button"`
8. `data-testid="field-name-input"`
9. `data-testid="field-type-input"`
10. `data-testid="field-type-picker-button"`
11. `data-testid="field-required-toggle"`
12. `data-testid="field-readonly-toggle"`
13. `data-testid="delete-field-button"`
14. `data-testid="edit-field-button"`
15. `data-testid="allow-additional-fields-checkbox"`
16. `data-testid="type-readonly-checkbox"`
17. `data-testid="save-type-button"`
18. `data-testid="add-enum-member-button"`
19. `data-testid="delete-enum-member-button"`
20. `data-testid="add-union-type-button"`
21. `data-testid="delete-union-type-button"`
22. `data-testid="type-menu-focused-view"`
23. `data-testid="type-menu-source"`
24. `data-testid="type-diagram-visualization"`
25. `data-testid="entity-head-[TypeName]"`
26. `data-testid="entity-link-[Type1]-[Type2]"`

## Test Scenarios

### 1. Navigate to Type Editor (Description: Open type editor from artifact menu)

**Steps:**
1. Click on the "WSO2 Integrator: BI" tab in the sidebar
2. Verify the project tree shows "TestIntegration" project
3. Click on the "Add Artifact" button
4. Verify the Artifacts menu is displayed
5. Under "Other Artifacts" section, click on "Type" option
6. Verify the Type Editor view is displayed
7. Verify the breadcrumb shows "Overview > Artifacts > Types"
8. Verify the "Add Type" button is visible
9. Verify the type diagram visualization area is displayed
10. Verify diagram controls (Download, Refresh, Zoom) are visible

**Expected Result:** Type Editor is successfully opened and all UI elements are visible.

---

### 2. Create Record Type, with fields (Description: Create a record type)

**Steps:**
1. Navigate to Type Editor
2. Click on the "Add Type" button
3. Verify the "New Type" dialog is displayed
4. Click on "Create from scratch" button
5. Verify the type creation form is displayed
6. Verify "Kind" combobox defaults to "Record"
7. Verify "Name" textbox defaults to "MyType"
8. Enter "Person" in the "Name" textbox
9. Click on the "Add Field" button (➕ icon) in the Fields section
10. Verify a new field row is added with default name "name1" and type "string"
11. Enter "firstName" in the field name textbox
12. Verify the field type is "string"
13. Click on the "Add Field" button again
14. Enter "lastName" in the second field name textbox
15. Verify the field type is "string"
16. Click on the "Add Field" button again
17. Enter "age" in the third field name textbox
18. Change the field type to "int"
19. Click on the "Save" button
20. Verify the type is created and appears in the diagram
21. Verify the type node "Person" is visible in the diagram
22. **Verify the source generated:**
    - Open the type source file (or use Type Menu > Source option)
    - Verify the generated Ballerina code contains:
      - `type Person record {`
      - `string firstName;`
      - `string lastName;`
      - `int age;`
      - `};`
23. **Verify the diagram:**
    - Verify the diagram shows entity node with `data-testid="entity-head-Person"`
    - Verify the diagram visualization is updated with the new type

**Expected Result:** A Record type "Person" is successfully created with three fields, source code is generated correctly, and the type appears in the diagram.

---

### 3. Verify record fields of required and optional (Description: Make some record fields optional and verify the source generated)

**Steps:**
1. Navigate to an existing Record type in Type Editor
2. Click on the type node or use the type menu to edit
3. Verify the type editing form is displayed
4. Locate a field (e.g., "age")
5. Toggle the field to make it optional (uncheck Required or mark as optional)
6. Verify another field remains required (e.g., "firstName")
7. Click on the "Save" button
8. Verify the type is updated
9. **Verify the source generated:**
    - Open the type source file (or use Type Menu > Source option)
    - Verify the generated Ballerina code shows:
      - Required fields without `?` (e.g., `string firstName;`)
      - Optional fields with `?` (e.g., `int age?;`)
10. **Verify the diagram:**
    - Verify the diagram still shows the type node correctly
    - Verify the diagram visualization reflects the updated type structure

**Expected Result:** Record fields are correctly marked as required or optional, source code reflects the optionality with `?` notation, and the diagram is updated.

---

### 4. Create Enum type (Description: Create enum with members, verify deletion of members as well)

**Steps:**
1. Navigate to Type Editor
2. Click on the "Add Type" button
3. Verify the "New Type" dialog is displayed
4. Click on "Create from scratch" button
5. Verify the type creation form is displayed
6. Click on the "Kind" combobox
7. Select "Enum" from the options
8. Enter "Status" in the "Name" textbox
9. Click on "Add Member" button (or similar) in the Members section
10. Enter "ACTIVE" as the first member name
11. Click on "Add Member" button again
12. Enter "INACTIVE" as the second member name
13. Click on "Add Member" button again
14. Enter "PENDING" as the third member name
15. Click on the "Save" button
16. Verify the Enum type is created and appears in the diagram
17. **Verify the source generated:**
    - Open the type source file (or use Type Menu > Source option)
    - Verify the generated Ballerina code contains:
      - `enum Status {`
      - `ACTIVE,`
      - `INACTIVE,`
      - `PENDING`
      - `}`
18. **Verify the diagram:**
    - Verify the diagram shows entity node with `data-testid="entity-head-Status"`
    - Verify the diagram visualization is updated with the new Enum type
19. To verify deletion of members:
    - Edit the Enum type
    - Click on the delete button (🗑️) next to "PENDING" member
    - Verify the member is removed from the list
    - Click on the "Save" button
    - **Verify the source generated:**
      - Verify the generated code no longer contains "PENDING"
    - **Verify the diagram:**
      - Verify the diagram still shows the Enum type correctly

**Expected Result:** An Enum type "Status" is successfully created with members, members can be deleted, source code is generated correctly, and the type appears in the diagram.

---

### 5. Create Union type (Description: Create union of types)

**Steps:**
1. Navigate to Type Editor
2. Click on the "Add Type" button
3. Verify the "New Type" dialog is displayed
4. Click on "Create from scratch" button
5. Verify the type creation form is displayed
6. Click on the "Kind" combobox
7. Select "Union" from the options
8. Enter "StringOrInt" in the "Name" textbox
9. Click on "Add Type" button (or similar) in the Type Members section
10. Select "string" as the first type member
11. Click on "Add Type" button again
12. Select "int" as the second type member
13. Click on the "Save" button
14. Verify the Union type is created and appears in the diagram
15. **Verify the source generated:**
    - Open the type source file (or use Type Menu > Source option)
    - Verify the generated Ballerina code contains:
      - `type StringOrInt string | int;`
16. **Verify the diagram:**
    - Verify the diagram shows entity node with `data-testid="entity-head-StringOrInt"`
    - Verify the diagram visualization is updated with the new Union type

**Expected Result:** A Union type "StringOrInt" is successfully created, source code is generated correctly with union syntax, and the type appears in the diagram.

---

### 6. Set Allow Additional Fields (Description: Enable open record)

**Steps:**
1. Navigate to an existing Record type in Type Editor
2. Click on the type node or use the type menu to edit
3. Verify the type editing form is displayed
4. Click on "Advanced Options" to expand the section
5. Locate the "Allow Additional Fields" checkbox
6. Check the "Allow Additional Fields" checkbox
7. Click on the "Save" button
8. Verify the type is updated
9. **Verify the source generated:**
    - Open the type source file (or use Type Menu > Source option)
    - Verify the generated Ballerina code contains:
      - `type Person record {|`
      - `string firstName;`
      - `...`
      - `|};` (open record syntax with `{|` and `|}`)
10. **Verify the diagram:**
    - Verify the diagram still shows the type node correctly
    - Verify the diagram visualization reflects the open record type

**Expected Result:** Record type is configured as an open record, source code uses open record syntax, and the diagram is updated.

---

### 7. Edit existing type (Description: Open type for editing update fields, add field)

**Steps:**
1. Navigate to Type Editor
2. Locate an existing type (e.g., "Person")
3. Click on the type node or use the type menu to edit
4. Verify the type editing form is displayed with existing fields
5. Locate a field (e.g., "firstName")
6. Change the field name to "givenName"
7. Click on the "Add Field" button
8. Enter "email" in the new field name textbox
9. Change the field type to "string"
10. Click on the "Save" button
11. Verify the type is updated
12. **Verify the source generated:**
    - Open the type source file (or use Type Menu > Source option)
    - Verify the generated Ballerina code contains:
      - Updated field name "givenName" instead of "firstName"
      - New field "string email;"
13. **Verify the diagram:**
    - Verify the diagram shows the updated type node
    - Verify the diagram visualization reflects the changes

**Expected Result:** Existing type is successfully edited, fields are updated and new fields are added, source code reflects the changes, and the diagram is updated.

---

### 8. Rename type (Description: Rename a type)

**Steps:**
1. Navigate to Type Editor
2. Locate an existing type (e.g., "Person")
3. Click on the type node or use the type menu to edit
4. Verify the type editing form is displayed
5. Locate the "Name" textbox
6. Change the name from "Person" to "Employee"
7. Click on the "Save" button
8. Verify the type is renamed
9. Verify the old name "Person" no longer appears in the diagram
10. Verify the new name "Employee" appears in the diagram
11. **Verify the source generated:**
    - Open the type source file (or use Type Menu > Source option)
    - Verify the generated Ballerina code contains:
      - `type Employee record {` (instead of `type Person record {`)
12. **Verify the diagram:**
    - Verify the diagram shows entity node with `data-testid="entity-head-Employee"`
    - Verify the old type node is removed and new one is added

**Expected Result:** Type is successfully renamed, source code reflects the new name, and the diagram is updated with the new type name.

---

### 9. Set field as Readonly (Description: Mark field as readonly)

**Steps:**
1. Navigate to an existing Record type in Type Editor
2. Click on the type node or use the type menu to edit
3. Verify the type editing form is displayed
4. Locate a field (e.g., "age")
5. Toggle the "Readonly" option for the field
6. Verify the field is marked as readonly
7. Click on the "Save" button
8. Verify the type is updated
9. **Verify the source generated:**
    - Open the type source file (or use Type Menu > Source option)
    - Verify the generated Ballerina code contains:
      - `readonly int age;` (or similar readonly syntax)
10. **Verify the diagram:**
    - Verify the diagram still shows the type node correctly
    - Verify the diagram visualization reflects the readonly field

**Expected Result:** Field is marked as readonly, source code includes readonly modifier, and the diagram is updated.

---

### 10. Set type as Readonly (Description: Mark entire type as readonly)

**Steps:**
1. Navigate to an existing type in Type Editor
2. Click on the type node or use the type menu to edit
3. Verify the type editing form is displayed
4. Click on "Advanced Options" to expand the section
5. Locate the "Readonly" checkbox
6. Check the "Readonly" checkbox
7. Click on the "Save" button
8. Verify the type is updated
9. **Verify the source generated:**
    - Open the type source file (or use Type Menu > Source option)
    - Verify the generated Ballerina code contains:
      - `readonly type Person record {` (or similar readonly type syntax)
10. **Verify the diagram:**
    - Verify the diagram still shows the type node correctly
    - Verify the diagram visualization reflects the readonly type

**Expected Result:** Entire type is marked as readonly, source code includes readonly modifier for the type, and the diagram is updated.

---

### 11. Create Service Class (Description: Create service class type)

**Steps:**
1. Navigate to Type Editor
2. Click on the "Add Type" button
3. Verify the "New Type" dialog is displayed
4. Click on "Create from scratch" button
5. Verify the type creation form is displayed
6. Click on the "Kind" combobox
7. Select "Service Class" from the options
8. Enter "UserService" in the "Name" textbox
9. Click on the "Save" button
10. Verify the Service Class type is created and the Service Class Designer view is displayed
11. **Verify the source generated:**
    - Open the type source file (or use Type Menu > Source option)
    - Verify the generated Ballerina code contains:
      - `service class UserService {`
      - `}`
12. **Verify the diagram:**
    - Verify the diagram shows entity node with `data-testid="entity-head-UserService"`
    - Verify the diagram visualization is updated with the new Service Class type

**Expected Result:** A Service Class "UserService" is successfully created, source code is generated correctly, and the type appears in the diagram.

---

### 12. Service Class Designer View: Add method to Service Class (Description: Add remote/resource method)

**Steps:**
1. Navigate to an existing Service Class in Type Editor
2. Verify the Service Class Designer view is displayed
3. Locate the "Methods" section or "Add Method" button
4. Click on "Add Method" button (or similar)
5. Select method type (Remote or Resource)
6. Enter method name (e.g., "getUser")
7. Configure method parameters if needed
8. Configure return type if needed
9. Click on "Save" or "Add" button
10. Verify the method is added to the Service Class
11. **Verify the source generated:**
    - Open the type source file (or use Type Menu > Source option)
    - Verify the generated Ballerina code contains:
      - Method definition (e.g., `remote function getUser() returns string;`)
12. **Verify the diagram:**
    - Verify the diagram still shows the Service Class type node
    - Verify the diagram visualization reflects the updated Service Class

**Expected Result:** Method is successfully added to Service Class, source code includes the method definition, and the diagram is updated.

---

### 13. Service Class Designer View: Add service class variables (Description: Add service class variables)

**Steps:**
1. Navigate to an existing Service Class in Type Editor
2. Verify the Service Class Designer view is displayed
3. Locate the "Variables" section or "Add Variable" button
4. Click on "Add Variable" button (or similar)
5. Enter variable name (e.g., "userCount")
6. Select variable type (e.g., "int")
7. (Optional) Set default value
8. Click on "Save" or "Add" button
9. Verify the variable is added to the Service Class
10. **Verify the source generated:**
    - Open the type source file (or use Type Menu > Source option)
    - Verify the generated Ballerina code contains:
      - Variable definition (e.g., `private int userCount;`)
11. **Verify the diagram:**
    - Verify the diagram still shows the Service Class type node
    - Verify the diagram visualization reflects the updated Service Class

**Expected Result:** Variable is successfully added to Service Class, source code includes the variable definition, and the diagram is updated.

---

### 14. Service Class Designer View: Edit service class configurations (Description: Verify service class configuration fields)

**Steps:**
1. Navigate to an existing Service Class in Type Editor
2. Verify the Service Class Designer view is displayed
3. Locate the "Configure" button or configuration section
4. Click on "Configure" button (⚙️ icon)
5. Verify the configuration form is displayed
6. Verify configuration fields are available (e.g., annotations, metadata)
7. Modify configuration values if applicable
8. Click on "Save" button
9. Verify the configuration is updated
10. **Verify the source generated:**
    - Open the type source file (or use Type Menu > Source option)
    - Verify the generated Ballerina code reflects the configuration changes
11. **Verify the diagram:**
    - Verify the diagram still shows the Service Class type node
    - Verify the diagram visualization reflects the updated configuration

**Expected Result:** Service Class configuration is successfully edited, source code reflects the changes, and the diagram is updated.

---

### 15. Service Class Designer View: Verify navigation to flow diagram views from designer view (Description: Verify navigation to flow diagram view from service class designer view methods)

**Steps:**
1. Navigate to an existing Service Class in Type Editor
2. Verify the Service Class Designer view is displayed
3. Locate a method in the Service Class
4. Click on the method (or "Open Flow" button)
5. Verify the flow diagram view is displayed
6. Verify the flow diagram shows the method's flow
7. Verify navigation back to Service Class Designer view is available
8. **Verify the source generated:**
    - Open the type source file (or use Type Menu > Source option)
    - Verify the generated Ballerina code contains the method definition
9. **Verify the diagram:**
    - Verify the diagram shows the Service Class type node
    - Verify the flow diagram is accessible from the designer view

**Expected Result:** Navigation to flow diagram view from Service Class Designer view is successful, source code is accessible, and diagram navigation works correctly.

---

### 16. Delete type (Description: Remove type from diagram)

**Steps:**
1. Navigate to Type Editor
2. Locate an existing type (e.g., "Person")
3. Click on the type node or use the type menu
4. Click on "Delete" option (or delete button)
5. Confirm the deletion in the dialog (if any)
6. Verify the type is removed from the diagram
7. Verify the type no longer appears in the type list
8. **Verify the source generated:**
    - Open the type source file (or use Type Menu > Source option)
    - Verify the generated Ballerina code no longer contains the deleted type definition
9. **Verify the diagram:**
    - Verify the diagram no longer shows the type node
    - Verify any links to the deleted type are also removed

**Expected Result:** Type is successfully deleted, source code no longer contains the type definition, and the diagram is updated to remove the type.

---

### 17. Create Array type field (Description: Add array field to record)

**Steps:**
1. Navigate to an existing Record type in Type Editor
2. Click on the type node or use the type menu to edit
3. Verify the type editing form is displayed
4. Click on the "Add Field" button
5. Enter "tags" in the field name textbox
6. Click on the field type picker or textbox
7. Select array type or enter "string[]"
8. Verify the field type is set to array
9. Click on the "Save" button
10. Verify the type is updated
11. **Verify the source generated:**
    - Open the type source file (or use Type Menu > Source option)
    - Verify the generated Ballerina code contains:
      - `string[] tags;` (array field syntax)
12. **Verify the diagram:**
    - Verify the diagram still shows the type node correctly
    - Verify the diagram visualization reflects the array field

**Expected Result:** Array field is successfully added to Record type, source code includes array syntax, and the diagram is updated.

---

### 18. Import type from JSON (Description: Generate type from JSON sample)

**UI elements used:**
- "Add Type" button in the Type Editor view
- "Import" tab in the TabPanel (alongside "Create from scratch" tab); `data-testid="import-tab"`
- Format dropdown (`id="format-selector"`, `vscode-dropdown`) — defaults to JSON, no change needed
- Name text field (label "Name") — appears above the textarea when format is JSON
- Textarea (placeholder "Paste your JSON here...") — inside a `vscode-text-area`
- "Import" button — becomes enabled once valid JSON is entered and Name is set

**Steps:**
1. Navigate to Type Editor (it should already be open from a previous test)
2. Click on the "Add Type" button
3. Verify the type creation panel opens with two tabs: "Create from scratch" and "Import"
4. Click on the "Import" tab
5. Verify the Import tab content is visible
6. Verify the Format dropdown defaults to "JSON"
7. Verify the "Name" text field is visible (above the textarea)
8. Enter "PersonJson" in the "Name" text field
9. Click on the textarea (placeholder "Paste your JSON here...")
10. Paste the following JSON: `{"name": "John", "age": 30, "city": "New York"}`
11. Verify no validation error is shown
12. Verify the "Import" button is now enabled
13. Click on the "Import" button
14. Verify the type editor navigates back to the diagram view
15. Verify the new type node "PersonJson" is visible in the diagram
16. **Verify the source generated:**
    - Verify the generated Ballerina code in `types.bal` contains a record type named `PersonJson`
    - Verify it has fields matching the JSON keys: `name` (string), `age` (int), `city` (string)
17. **Verify the diagram:**
    - Verify the diagram shows `data-testid="type-node-PersonJson"`

**Expected Result:** A Record type "PersonJson" is successfully generated from the JSON sample, source code matches the JSON structure, and the type node appears in the diagram.

---

### 19. Import type from XML (Description: Generate type from XML sample)

**UI elements used:**
- "Add Type" button in the Type Editor view
- "Import" tab in the TabPanel; `data-testid="import-tab"`
- Format dropdown (`id="format-selector"`, `vscode-dropdown`) — must be changed from JSON to XML
- Textarea (placeholder "Paste your XML here...") — inside a `vscode-text-area`; appears after format change
- No "Name" field for XML — the type name is derived from the XML root element tag
- "Import" button — becomes enabled once valid XML is entered

**Steps:**
1. Navigate to Type Editor (continuing from previous test in the same session)
2. Click on the "Add Type" button
3. Verify the type creation panel opens with two tabs: "Create from scratch" and "Import"
4. Click on the "Import" tab
5. Verify the Import tab content is visible
6. Locate the Format dropdown (currently showing "JSON")
7. Change the Format dropdown value to "XML"
8. Verify the "Name" text field is no longer visible (XML does not require a name — derived from root element)
9. Verify the textarea changes to show placeholder "Paste your XML here..."
10. Click on the textarea and paste the following XML: `<person><name>John</name><age>30</age></person>`
11. Verify no validation error is shown
12. Verify the "Import" button is now enabled
13. Click on the "Import" button
14. Verify the type editor navigates back to the diagram view
15. Verify a new type node derived from the XML root element ("Person") is visible in the diagram
16. **Verify the source generated:**
    - Verify the generated Ballerina code in `types.bal` contains a record type (name based on root element "person" → "Person")
    - Verify it has fields matching the XML child elements: `name` (string), `age` (string or int)
17. **Verify the diagram:**
    - Verify the diagram shows a new `data-testid="type-node-Person"` (or the inferred name)

**Expected Result:** A Record type is successfully generated from the XML sample with the name derived from the root element, source code matches the XML structure, and the type node appears in the diagram.

---

### 20. Type Menu option: Focused View (Description: Check navigation to the focused view via nodes menu)

**Steps:**
1. Navigate to Type Editor
2. Locate an existing type in the diagram
3. Right-click on the type node (or use type menu)
4. Verify the context menu is displayed
5. Click on "Focused View" option
6. Verify the focused view is displayed
7. Verify only the selected type and its related types are shown
8. Verify navigation back to full diagram view is available
9. **Verify the source generated:**
    - Open the type source file (or use Type Menu > Source option)
    - Verify the source code is accessible from focused view
10. **Verify the diagram:**
    - Verify the focused view shows the type node correctly
    - Verify related types are visible in focused view

**Expected Result:** Focused view is successfully accessed via type menu, source code is accessible, and diagram shows focused view correctly.

---

### 21. Type Menu option: Source (Description: Check navigation to the source code via nodes menu)

**Steps:**
1. Navigate to Type Editor
2. Locate an existing type in the diagram
3. Right-click on the type node (or use type menu)
4. Verify the context menu is displayed
5. Click on "Source" option
6. Verify the source code editor is opened
7. Verify the source code for the type is displayed
8. Verify the source code matches the type definition
9. **Verify the source generated:**
    - Verify the source code file is opened in the editor
    - Verify the type definition is visible and correct
10. **Verify the diagram:**
    - Verify navigation back to diagram view is available
    - Verify the diagram is accessible from source view

**Expected Result:** Source code is successfully accessed via type menu, source code is displayed correctly, and navigation to/from diagram works.

---

### 22. Type Diagram Visualization (Description: Check Type diagram visualization via tree view button and adding new type add new option in tree view)

**Steps:**
1. Navigate to Type Editor
2. Verify the type diagram visualization area is displayed
3. Verify existing types are shown as nodes in the diagram
4. Click on the "Add Type" button in the tree view or diagram area
5. Verify the type creation dialog is displayed
6. Create a new type (e.g., "Address")
7. Verify the new type appears in the diagram
8. Verify the diagram visualization is updated
9. Verify type relationships are shown as links in the diagram
10. **Verify the source generated:**
    - Open the type source file (or use Type Menu > Source option)
    - Verify the generated Ballerina code for the new type is correct
11. **Verify the diagram:**
    - Verify the diagram shows entity node with `data-testid="entity-head-Address"`
    - Verify the diagram visualization includes the new type
    - Verify type links are displayed correctly (if types reference each other)

**Expected Result:** Type diagram visualization works correctly, new types are added to the diagram, source code is generated, and diagram is updated.

---

### 23. Nested Type Creation (Description: Add a new type for a record/any type field to open the typeEditor popup)

**Steps:**
1. Navigate to Type Editor
2. Create or edit a Record type (e.g., "Person")
3. Click on the "Add Field" button
4. Enter "address" in the field name textbox
5. Click on the field type picker
6. Select "Create New Type" or "Record" option
7. Verify the Type Editor popup/dialog is opened for creating a nested type
8. Enter "Address" as the nested type name
9. Add fields to the nested type (e.g., "street", "city", "zipCode")
10. Click on "Save" button in the nested type dialog
11. Verify the nested type is created
12. Verify the field type is set to the nested type (e.g., "Address")
13. Click on "Save" button in the parent type form
14. Verify both types are created and appear in the diagram
15. **Verify the source generated:**
    - Open the type source file (or use Type Menu > Source option)
    - Verify the generated Ballerina code contains:
      - Nested type definition (e.g., `type Address record { ... }`)
      - Parent type with field using nested type (e.g., `Address address;`)
16. **Verify the diagram:**
    - Verify the diagram shows both type nodes
    - Verify the diagram shows a link between parent and nested type
    - Verify `data-testid="entity-link-Person-Address"` is present

**Expected Result:** Nested type is successfully created, source code includes both type definitions, and the diagram shows the relationship between types.

---

### 24. Verify inline record support (Description: Add inline record via field options)

**Steps:**
1. Navigate to Type Editor
2. Create or edit a Record type (e.g., "Person")
3. Click on the "Add Field" button
4. Enter "contact" in the field name textbox
5. Click on the field type picker
6. Select "Inline Record" or "Record" option with inline option
7. Verify inline record fields can be added directly
8. Add fields to the inline record (e.g., "email", "phone")
9. Verify the inline record is configured
10. Click on "Save" button
11. Verify the type is updated
12. **Verify the source generated:**
    - Open the type source file (or use Type Menu > Source option)
    - Verify the generated Ballerina code contains:
      - Inline record syntax (e.g., `record { string email; string phone; } contact;`)
13. **Verify the diagram:**
    - Verify the diagram still shows the type node correctly
    - Verify the diagram visualization reflects the inline record field

**Expected Result:** Inline record is successfully added to the type, source code uses inline record syntax, and the diagram is updated.

---

## Notes

- All test scenarios should verify both source code generation and diagram visualization at the end
- Source verification can be done by opening the type source file or using the Type Menu > Source option
- Diagram verification should check for type nodes using `data-testid="entity-head-[TypeName]"` and type links using `data-testid="entity-link-[Type1]-[Type2]"`
- Test utilities for source and diagram verification are available in the test framework

