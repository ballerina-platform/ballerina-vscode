# Workspace Overview and Project Switching - Test Specification

## Application Overview

The Workspace Overview feature in WSO2 Integrator: BI allows users to view all projects in a workspace, navigate between projects, add new projects, and delete projects. The Project Switching feature enables users to change the active project context, which updates the artifacts tree to reflect the selected project's artifacts.

## UI Elements Identified

### Buttons and Actions
- **WSO2 Integrator: BI** tab in the sidebar
- **Add Project** button (text: "Add Project", icon: ➕) - in WSO2 Integrator: BI toolbar
- **Show Overview** button (text: "Show Overview", icon: 📊) - in WSO2 Integrator: BI toolbar
- **Refresh** button (icon: 🔄) - on project tree items
- **Show Visualizer** button (icon: 📊) - on project tree items
- **Delete** button (icon: 🗑️) - for deleting projects (context menu or toolbar)
- **Project card/item** - clickable project items in workspace overview
- **Convert & Add Integration** button (text: "Convert & Add Integration") - in workspace creation form
- **Expand/Collapse** button - for Optional Configurations section

### Form Fields (Add Project/Workspace)
- **Workspace Name*** textbox (required)
  - Placeholder: "Enter workspace name"
- **Integration Name*** textbox (required)
  - Placeholder: "Enter an integration name"
- **Package Name** textbox (optional)
  - Description: "This will be used as the Ballerina package name for the integration."
- **Optional Configurations** expandable section (collapsed by default):
  - **Organization Name** textbox (optional)
    - Description: "The organization that owns this Ballerina package."
  - **Package Version** textbox (optional)
    - Placeholder: "0.1.0"
    - Description: "Version of the Ballerina package."

### Navigation Elements
- **WSO2 Integrator: BI** sidebar panel
- **Project Tree** view showing:
  - Project name (e.g., "TestIntegration")
  - Entry Points section
  - Listeners section
  - Artifacts under each project
- **Workspace Overview** panel/view
- **Breadcrumbs** showing current navigation path

### Workspace Overview View Elements
- **Projects List** - displays all projects in the workspace
- **Project Cards** - individual project items with:
  - Project name
  - Project path (optional)
  - Project metadata (optional)
- **Add Project** button/option
- **Search/Filter** (if available)

### Project Tree Elements
- **Project root item** (e.g., "TestIntegration")
  - Expandable/collapsible
  - Shows project icon
  - Has toolbar with Refresh and Show Visualizer buttons
- **Entry Points** section
  - Lists all entry point artifacts (Services, Automations, etc.)
- **Listeners** section
  - Lists all listeners configured in the project
- **Artifact items** under Entry Points
  - Service items (HTTP, Kafka, RabbitMQ, etc.)
  - Automation items
  - Handler items (onError, onCreate, etc.)

## Missing Test IDs Recommendations

The following test IDs should be added for better testability:

1. `data-testid="wso2-bi-tab"`
2. `data-testid="add-project-button"`
3. `data-testid="show-overview-button"`
4. `data-testid="workspace-overview-panel"`
5. `data-testid="project-list"`
6. `data-testid="project-card-[ProjectName]"`
7. `data-testid="project-tree-item-[ProjectName]"`
8. `data-testid="project-refresh-button"`
9. `data-testid="project-show-visualizer-button"`
10. `data-testid="delete-project-button"`
11. `data-testid="entry-points-section"`
12. `data-testid="listeners-section"`
13. `data-testid="project-switch-indicator"`
14. `data-testid="workspace-name-input"`
15. `data-testid="integration-name-input"`
16. `data-testid="package-name-input"`
17. `data-testid="optional-configurations-section"`
18. `data-testid="organization-name-input"`
19. `data-testid="package-version-input"`
20. `data-testid="convert-add-integration-button"`

## Test Scenarios

### 1. View workspace overview (Description: Open workspace overview panel)

**Steps:**
1. Click on the "WSO2 Integrator: BI" tab in the sidebar
2. Verify the WSO2 Integrator: BI panel is displayed
3. Verify the toolbar shows "Add Project" and "Show Overview" buttons
4. Click on the "Show Overview" button (📊 icon)
5. Verify the Workspace Overview panel/view is displayed
6. Verify the view shows all projects in the workspace
7. Verify project cards/items are visible
8. Verify navigation elements are accessible

**Expected Result:** Workspace Overview panel is successfully opened and displays all projects in the workspace.

---

### 2. List all projects (Description: See all projects in workspace)

**Steps:**
1. Navigate to Workspace Overview
2. Verify the projects list is displayed
3. Verify all projects in the workspace are shown
4. Verify each project is displayed as a card/item with:
   - Project name
   - Project icon (if available)
5. Count the number of projects displayed
6. Verify the count matches the actual number of projects in the workspace
7. (If multiple projects exist) Verify projects are listed in a clear, organized manner

**Expected Result:** All projects in the workspace are successfully listed and visible in the Workspace Overview.

---

### 3. Navigate to project (Description: Click project to open)

**Steps:**
1. Navigate to Workspace Overview
2. Verify the projects list is displayed
3. Locate a project (e.g., "TestIntegration")
4. Click on the project card/item
5. Verify the project is opened
6. Verify the view switches to the project overview/designer view
7. Verify the breadcrumb shows the project name
8. Verify the project tree in the sidebar shows the selected project
9. Verify the project's artifacts are displayed
10. **Verify the source generated:**
    - Verify the project's source files are accessible
    - Verify the project structure is correct
11. **Verify the diagram:**
    - Verify the project's diagram view is accessible
    - Verify the diagram shows the project's artifacts correctly

**Expected Result:** Project is successfully opened, artifacts are displayed, and navigation to the project view works correctly.

---

### 4. Add Integration (Description: Add new project to workspace)

**Steps:**
1. Navigate to WSO2 Integrator: BI panel
2. Click on the "Add Project" button (➕ icon) in the sidebar toolbar
3. Verify the "Convert to Workspace & Add Integration" form is displayed
4. Verify the form heading shows "Convert to Workspace & Add Integration"
5. Locate the "Workspace Name*" textbox (required field)
6. Verify the placeholder text is "Enter workspace name"
7. Enter workspace name (e.g., "MyWorkspace")
8. Locate the "Integration Name*" textbox (required field)
9. Verify the placeholder text is "Enter an integration name"
10. Enter integration name (e.g., "NewIntegration")
11. Locate the "Package Name" textbox
12. Verify the description shows "This will be used as the Ballerina package name for the integration."
13. (Optional) Enter package name or verify it's auto-generated
14. Locate the "Optional Configurations" section
15. Click on "Expand" to expand the Optional Configurations section
16. Verify "Organization Name" textbox is displayed
17. Verify the description shows "The organization that owns this Ballerina package."
18. (Optional) Enter organization name
19. Verify "Package Version" textbox is displayed
20. Verify the placeholder text is "0.1.0"
21. Verify the description shows "Version of the Ballerina package."
22. (Optional) Enter package version or verify default
23. Verify the "Convert & Add Integration" button is enabled (after filling required fields)
24. Click on the "Convert & Add Integration" button
25. Verify the workspace is converted and integration is created
26. Verify the new project appears in the projects list
27. Verify the new project appears in the workspace overview
28. Verify the project tree shows the new project
29. **Verify the source generated:**
    - Verify the project's source files are created
    - Verify the project structure (Ballerina.toml, main.bal, etc.) is correct
    - Verify the Ballerina.toml contains the correct package name, organization, and version
30. **Verify the diagram:**
    - Verify the project's diagram view is accessible
    - Verify the diagram shows an empty project state or default structure

**Expected Result:** New workspace and integration are successfully created, appears in the projects list, and source files are generated correctly with proper package configuration.

---

### 5. Delete project from workspace (Description: Remove project)

**Steps:**
1. Navigate to Workspace Overview
2. Locate a project to delete (e.g., "TestIntegration")
3. Right-click on the project or use the project menu
4. Click on "Delete" option (or delete button)
5. Verify a confirmation dialog is displayed (if applicable)
6. Confirm the deletion
7. Verify the project is removed from the projects list
8. Verify the project no longer appears in the workspace overview
9. Verify the project tree no longer shows the deleted project
10. **Verify the source generated:**
    - Verify the project's source files are removed from the workspace
    - Verify the project directory is deleted (if applicable)
11. **Verify the diagram:**
    - Verify the diagram no longer shows the deleted project
    - Verify navigation to the deleted project is no longer possible

**Expected Result:** Project is successfully deleted from the workspace, removed from all views, and source files are cleaned up.

---

### 6. Switch active project (Description: Change context to different project)

**Steps:**
1. Navigate to Workspace Overview
2. Verify multiple projects are available in the workspace
3. Verify the current active project is indicated (e.g., highlighted, selected state)
4. Locate a different project in the projects list
5. Click on the different project
6. Verify the active project context is switched
7. Verify the view updates to show the selected project
8. Verify the project tree in the sidebar updates to show the new active project
9. Verify the breadcrumb reflects the new active project
10. Verify the previous project's artifacts are no longer visible
11. Verify the new project's artifacts are displayed
12. **Verify the source generated:**
    - Verify the source view shows files from the new active project
    - Verify the project structure matches the selected project
13. **Verify the diagram:**
    - Verify the diagram view shows artifacts from the new active project
    - Verify the diagram reflects the correct project context

**Expected Result:** Active project is successfully switched, artifacts tree updates to show the new project's artifacts, and all views reflect the new project context.

---

### 7. Artifacts reflect active project (Description: Tree shows correct artifacts)

**Steps:**
1. Navigate to a specific project (e.g., "TestIntegration")
2. Verify the project is set as active
3. Verify the project tree in the sidebar shows the active project name
4. Verify the "Entry Points" section is displayed
5. Verify the artifacts under "Entry Points" match the active project's artifacts
6. Verify the "Listeners" section is displayed
7. Verify the listeners under "Listeners" match the active project's listeners
8. Switch to a different project
9. Verify the project tree updates
10. Verify the "Entry Points" section shows artifacts from the new active project
11. Verify the "Listeners" section shows listeners from the new active project
12. Verify the artifacts match the new active project's configuration
13. **Verify the source generated:**
    - Verify the source files shown are from the active project
    - Verify opening source files opens files from the correct project
14. **Verify the diagram:**
    - Verify the diagram shows artifacts from the active project
    - Verify the diagram reflects the correct project's structure

**Expected Result:** Artifacts tree correctly reflects the active project, showing only artifacts belonging to the currently selected project, and source/diagram views match the active project.

---

## Notes

- All test scenarios should verify both source code accessibility and diagram visualization at the end where applicable
- Source verification can be done by checking that source files are accessible and belong to the correct project
- Diagram verification should check that the diagram shows artifacts from the correct project
- Test utilities for source and diagram verification are available in the test framework
- Workspace Overview is particularly useful in multi-project workspaces
- Project switching updates the entire UI context to reflect the selected project
- The artifacts tree dynamically updates based on the active project
- Projects can be added, deleted, and navigated to from the Workspace Overview
- The "Show Overview" button behavior may vary based on whether it's a single-project or multi-project workspace

