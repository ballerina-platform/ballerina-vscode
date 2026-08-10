# Project Explorer - Test Specification

## Application Overview

The Project Explorer feature in WSO2 Integrator: BI provides a hierarchical tree view of project artifacts, allowing users to navigate, expand, collapse, select, and manage artifacts. The tree displays Entry Points (Services, Automations), Listeners, and their associated handlers/resources. Users can open visualizers, refresh the project structure, add artifacts, delete artifacts, and navigate to source files.

## UI Elements Identified

### Buttons and Actions
- **WSO2 Integrator: BI** tab in the sidebar
- **Add Project** button (text: "Add Project", icon: ➕) - in WSO2 Integrator: BI toolbar
- **Show Overview** button (text: "Show Overview", icon: 📊) - in WSO2 Integrator: BI toolbar
- **Refresh** button (icon: 🔄) - on project root tree item toolbar
- **Show Visualizer** button (icon: 📊) - on project root tree item toolbar
- **Visualizer** button (icon: 📊) - on individual artifact tree items
- **Add** button (icon: ➕) - on section headers (e.g., "Entry Points")
- **Expand/Collapse** icon (▼/▶) - on expandable tree items
- **Delete** option - in context menu for artifacts

### Tree Structure Elements
- **Project root item** (e.g., "TestIntegration")
  - Expandable/collapsible
  - Shows project icon
  - Has toolbar with Refresh and Show Visualizer buttons
- **Entry Points** section
  - Expandable/collapsible
  - Has "Add" button (➕)
  - Lists all entry point artifacts (Services, Automations, etc.)
- **Listeners** section
  - Expandable/collapsible
  - Lists all listeners configured in the project
- **Artifact items** under Entry Points
  - Service items (HTTP, Kafka, RabbitMQ, etc.)
  - Automation items
  - Handler items (onError, onCreate, onFileChange, etc.)
  - Some services are expandable showing their handlers/resources
- **Listener items** under Listeners section
  - Listener items (kafkaListener, httpDefaultListener, etc.)

### Navigation Elements
- **Tree view** - hierarchical display of project structure
- **Context menu** - right-click menu on tree items
- **Double-click** - opens source file in editor
- **Single click** - selects tree item

## Missing Test IDs Recommendations

The following test IDs should be added for better testability:

1. `data-testid="project-explorer-tree"`
2. `data-testid="project-root-item-[ProjectName]"`
3. `data-testid="entry-points-section"`
4. `data-testid="listeners-section"`
5. `data-testid="tree-item-[ArtifactName]"`
6. `data-testid="tree-item-expand-icon-[ItemName]"`
7. `data-testid="tree-item-collapse-icon-[ItemName]"`
8. `data-testid="tree-item-visualizer-button-[ItemName]"`
9. `data-testid="project-refresh-button"`
10. `data-testid="project-show-visualizer-button"`
11. `data-testid="entry-points-add-button"`
12. `data-testid="context-menu-delete-option"`
13. `data-testid="tree-item-handler-[HandlerName]"`

## Test Scenarios

### 1. View project tree (Description: Tree renders with project)

**Steps:**
1. Navigate to WSO2 Integrator: BI panel in the sidebar
2. Click on the "WSO2 Integrator: BI" tab
3. Verify the Project Explorer tree is displayed
4. Verify the project root item is visible (e.g., "TestIntegration")
5. Verify the project root item shows the project icon
6. Verify the project root item has a toolbar with "Refresh" and "Show Visualizer" buttons
7. Verify "Entry Points" section is visible under the project root
8. Verify "Listeners" section is visible under the project root
9. Verify artifacts are listed under "Entry Points" section
10. Verify listeners are listed under "Listeners" section
11. Verify the tree structure is hierarchical and properly indented
12. **Verify the source generated:**
    - Verify the project structure matches the actual project files
    - Verify all artifacts are correctly represented in the tree
13. **Verify the diagram:**
    - Verify the tree visualization correctly represents the project hierarchy
    - Verify expandable items show the correct expand/collapse state

---

### 2. Expand tree node (Description: Click to expand)

**Steps:**
1. Navigate to Project Explorer tree
2. Identify a collapsed tree node (shows ▶ icon)
3. Click on the expand icon (▶) or the tree item itself
4. Verify the tree node expands (icon changes to ▼)
5. Verify child items are displayed
6. Verify the tree structure updates correctly
7. Verify the expanded state is maintained
8. **Verify the source generated:**
    - Verify the expanded tree structure matches the actual project structure
    - Verify all child items are correctly displayed
9. **Verify the diagram:**
    - Verify the expanded node shows all child items in the tree visualization
    - Verify the expand icon state is correct (▼)

---

### 3. Collapse tree node (Description: Click to collapse)

**Steps:**
1. Navigate to Project Explorer tree
2. Identify an expanded tree node (shows ▼ icon)
3. Click on the collapse icon (▼) or the tree item itself
4. Verify the tree node collapses (icon changes to ▶)
5. Verify child items are hidden
6. Verify the tree structure updates correctly
7. Verify the collapsed state is maintained
8. **Verify the source generated:**
    - Verify the collapsed tree structure is correctly represented
    - Verify child items are hidden but still exist in the project
9. **Verify the diagram:**
    - Verify the collapsed node hides child items in the tree visualization
    - Verify the collapse icon state is correct (▶)

---

### 4. Select artifact in tree (Description: Click artifact item)

**Steps:**
1. Navigate to Project Explorer tree
2. Identify an artifact item in the tree (e.g., "Kafka Event Integration", "HTTP Service - /")
3. Click on the artifact item
4. Verify the artifact item is selected (highlighted)
5. Verify the artifact details are displayed (if applicable)
6. Verify the visualizer/designer view opens for the selected artifact
7. Verify the tree item remains selected
8. **Verify the source generated:**
    - Verify the selected artifact's source code is accessible
    - Verify the artifact information is correctly displayed
9. **Verify the diagram:**
    - Verify the selected artifact is highlighted in the tree visualization
    - Verify the visualizer/designer view shows the correct artifact

---

### 5. Open visualizer from tree (Description: Click visualizer button)

**Steps:**
1. Navigate to Project Explorer tree
2. Identify an artifact item with a visualizer button (📊 icon)
3. Click on the visualizer button on the artifact item
4. Verify the visualizer/designer view opens
5. Verify the correct artifact is displayed in the visualizer
6. Verify the tree item remains visible and selected
7. Verify navigation between tree and visualizer works correctly
8. **Verify the source generated:**
    - Verify the visualizer shows the correct artifact's source representation
    - Verify the artifact's configuration is correctly displayed
9. **Verify the diagram:**
    - Verify the visualizer diagram correctly represents the selected artifact
    - Verify the diagram matches the tree item's artifact type

---

### 6. Refresh project structure (Description: Click refresh button)

**Steps:**
1. Navigate to Project Explorer tree
2. Verify the current tree structure
3. Click on the "Refresh" button (🔄) on the project root item toolbar
4. Verify the tree refreshes
5. Verify all artifacts are updated in the tree
6. Verify new artifacts (if any) appear in the tree
7. Verify deleted artifacts (if any) are removed from the tree
8. Verify the tree structure is correctly updated
9. **Verify the source generated:**
    - Verify the refreshed tree structure matches the current project files
    - Verify all artifacts are correctly represented after refresh
10. **Verify the diagram:**
    - Verify the tree visualization is updated after refresh
    - Verify the tree structure correctly reflects the current project state

---

### 7. Delete artifact from tree (Description: Use context menu delete)

**Steps:**
1. Navigate to Project Explorer tree
2. Identify an artifact item to delete (e.g., a service, handler)
3. Right-click on the artifact item
4. Verify the context menu is displayed
5. Click on "Delete" option in the context menu
6. Verify a confirmation dialog is displayed (if applicable)
7. Confirm the deletion
8. Verify the artifact is removed from the tree
9. Verify the tree structure updates correctly
10. Verify the artifact is deleted from the project files
11. **Verify the source generated:**
    - Verify the artifact's source file is deleted from the project
    - Verify the project structure is updated correctly
12. **Verify the diagram:**
    - Verify the deleted artifact is removed from the tree visualization
    - Verify the tree structure is correctly updated after deletion

---

### 8. Add artifact from tree (Description: Use add button on section)

**Steps:**
1. Navigate to Project Explorer tree
2. Expand the "Entry Points" section (if collapsed)
3. Verify the "Add" button (➕) is visible on the "Entry Points" section header
4. Click on the "Add" button
5. Verify the "Add Artifact" menu/dialog is displayed
6. Select an artifact type to create (e.g., HTTP Service, Kafka Integration)
7. Complete the artifact creation form
8. Save the artifact
9. Verify the new artifact appears in the tree under "Entry Points"
10. Verify the tree structure updates correctly
11. **Verify the source generated:**
    - Verify the new artifact's source file is created in the project
    - Verify the artifact's source code is correctly generated
12. **Verify the diagram:**
    - Verify the new artifact appears in the tree visualization
    - Verify the artifact is correctly positioned in the tree hierarchy

---

### 9. Navigate to source file (Description: Double click to open file)

**Steps:**
1. Navigate to Project Explorer tree
2. Identify an artifact item that has a source file (e.g., a service, handler)
3. Double-click on the artifact item
4. Verify the source file opens in the editor
5. Verify the correct file is opened
6. Verify the file content is displayed correctly
7. Verify the editor tab shows the file name
8. Verify the tree item remains visible
9. **Verify the source generated:**
    - Verify the opened source file contains the correct artifact code
    - Verify the source code matches the artifact's configuration
10. **Verify the diagram:**
    - Verify the source file navigation works correctly
    - Verify the editor and tree view are synchronized

---

## Notes

- The Project Explorer tree automatically refreshes when project files change
- Some tree items (like services with handlers) are expandable to show their child items
- The visualizer button opens the visual/designer view for the artifact
- Context menu options may vary based on the artifact type
- Double-clicking on a tree item opens the source file in the editor
- The tree maintains expansion state during navigation

