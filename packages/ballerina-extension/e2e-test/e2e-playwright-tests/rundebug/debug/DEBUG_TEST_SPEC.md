# Debug Integration - Test Specification

## Application Overview

The Debug Integration feature in WSO2 Integrator: BI allows users to debug Ballerina integrations with breakpoints, step execution, variable inspection, and call stack navigation. The debugger supports breakpoints in both source code and diagram views, with synchronization between the two. Users can step through code execution, inspect variables at breakpoints, and navigate the call stack.

## UI Elements Identified

### Buttons and Actions
- **Debug Integration** button (text: "Debug Integration", icon: 🐛) - in editor toolbar
- **Continue** button (F5) - in debug toolbar
- **Step Over** button (F10) - in debug toolbar
- **Step Into** button (F11) - in debug toolbar
- **Step Out** button (Shift+F11) - in debug toolbar
- **Stop** button (Shift+F5) - in debug toolbar
- **Restart** button - in debug toolbar
- **Command Palette** - for executing `BI.project.debug` command

### Debug UI Elements
- **Debug toolbar** - appears when debug session starts
- **Breakpoint indicator** - red dot in source code gutter
- **Breakpoint indicator** - on diagram nodes
- **Active breakpoint indicator** - highlighted breakpoint where execution paused
- **Variables panel** - shows variable values at breakpoint
- **Call stack panel** - shows execution call stack
- **Debug console** - for evaluating expressions

### Breakpoint Elements
- **Source breakpoint** - set by clicking gutter in .bal file
- **Diagram breakpoint** - set by clicking breakpoint indicator on diagram node
- **Breakpoint sync** - breakpoints sync between source and diagram

## Missing Test IDs Recommendations

The following test IDs should be added for better testability:

1. `data-testid="debug-integration-button"`
2. `data-testid="debug-toolbar"`
3. `data-testid="continue-button"`
4. `data-testid="step-over-button"`
5. `data-testid="step-into-button"`
6. `data-testid="step-out-button"`
7. `data-testid="stop-debug-button"`
8. `data-testid="breakpoint-indicator-source"`
9. `data-testid="breakpoint-indicator-diagram"`
10. `data-testid="variables-panel"`
11. `data-testid="call-stack-panel"`
12. `data-testid="active-breakpoint-indicator"`
13. `data-testid="debug-console"`

## Test Scenarios

### 1. Click Debug button from toolbar (Description: Click Debug Integration button in editor toolbar)

**Steps:**
1. Navigate to WSO2 Integrator: BI view
2. Verify the "Debug Integration" button is visible in the editor toolbar
3. Click on the "Debug Integration" button
4. Verify the button is clicked successfully
5. Verify the debug session starts
6. Verify the debug toolbar appears
7. Verify the terminal opens (if applicable)
8. **Verify the source generated:**
    - Verify the debugger attaches to the correct source files
    - Verify the source code is correctly loaded for debugging
9. **Verify the diagram:**
    - Verify the diagram shows debug mode indicators
    - Verify the diagram remains accessible during debug session

---

### 2. Verify debug session starts (Description: Check debug toolbar appears)

**Steps:**
1. Click on the "Debug Integration" button
2. Verify the debug session starts
3. Verify the debug toolbar appears at the top of the editor
4. Verify the debug toolbar shows Continue, Step Over, Step Into, Step Out, and Stop buttons
5. Verify the debug toolbar shows the current debug configuration
6. Verify the debug status is shown (e.g., "Debugging")
7. Verify the Variables panel is available (if applicable)
8. Verify the Call Stack panel is available (if applicable)
9. **Verify the source generated:**
    - Verify the debugger correctly attaches to the source
    - Verify the source files are loaded for debugging
10. **Verify the diagram:**
    - Verify the diagram shows debug session indicators
    - Verify the diagram reflects the debug state

---

### 3. Add breakpoint from diagram (Description: Click breakpoint indicator on node)

**Steps:**
1. Start a debug session
2. Navigate to the diagram view
3. Identify a node where a breakpoint should be added
4. Click on the breakpoint indicator/icon on the diagram node
5. Verify a breakpoint is added to the node
6. Verify the breakpoint indicator is visible on the node
7. Verify the breakpoint is synchronized to the source code
8. Verify the corresponding source line shows a breakpoint
9. **Verify the source generated:**
    - Verify the breakpoint is correctly set in the source code
    - Verify the breakpoint line is valid for debugging
10. **Verify the diagram:**
    - Verify the breakpoint indicator is correctly displayed on the node
    - Verify the breakpoint is shown in the diagram visualization

---

### 4. Remove breakpoint from diagram (Description: Toggle off breakpoint)

**Steps:**
1. Start a debug session
2. Add a breakpoint on a diagram node (from previous scenario)
3. Verify the breakpoint is set
4. Click on the breakpoint indicator again on the same node
5. Verify the breakpoint is removed from the node
6. Verify the breakpoint indicator disappears from the node
7. Verify the breakpoint is removed from the source code
8. Verify the source code gutter no longer shows the breakpoint
9. **Verify the source generated:**
    - Verify the breakpoint is correctly removed from the source
    - Verify no breakpoint remains at that location
10. **Verify the diagram:**
    - Verify the breakpoint indicator is removed from the diagram
    - Verify the diagram no longer shows the breakpoint

---

### 5. Add breakpoint from source (Description: Click gutter in .bal file)

**Steps:**
1. Start a debug session
2. Open a .bal source file in the editor
3. Navigate to a line where a breakpoint should be added
4. Click on the gutter (left margin) of the source file at the desired line
5. Verify a breakpoint is added
6. Verify a red dot appears in the gutter
7. Verify the breakpoint is synchronized to the diagram
8. Verify the corresponding diagram node shows a breakpoint indicator
9. **Verify the source generated:**
    - Verify the breakpoint is correctly set at the source line
    - Verify the breakpoint line is valid for debugging
10. **Verify the diagram:**
    - Verify the breakpoint is shown on the corresponding diagram node
    - Verify the diagram reflects the source breakpoint

---

### 6. Breakpoint syncs to diagram (Description: Source breakpoint shows on diagram)

**Steps:**
1. Start a debug session
2. Add a breakpoint in the source code (from previous scenario)
3. Verify the breakpoint is set in the source
4. Navigate to the diagram view
5. Verify the corresponding diagram node shows a breakpoint indicator
6. Verify the breakpoint indicator matches the source breakpoint
7. Verify the diagram node is highlighted or marked to show the breakpoint
8. Verify the breakpoint sync is bidirectional (diagram ↔ source)
9. **Verify the source generated:**
    - Verify the breakpoint location is correctly mapped to the diagram
    - Verify the source-to-diagram mapping is accurate
10. **Verify the diagram:**
    - Verify the diagram correctly displays the synchronized breakpoint
    - Verify the diagram node corresponds to the source breakpoint location

---

### 7. Hit breakpoint (Description: Execution pauses at breakpoint)

**Steps:**
1. Start a debug session
2. Add a breakpoint (in source or diagram)
3. Trigger the code execution that will hit the breakpoint
4. Verify execution pauses at the breakpoint
5. Verify the active breakpoint is highlighted
6. Verify the source code shows the current execution line
7. Verify the diagram shows the active breakpoint node
8. Verify the debug toolbar shows paused state
9. **Verify the source generated:**
    - Verify the execution correctly pauses at the breakpoint line
    - Verify the source code reflects the paused state
10. **Verify the diagram:**
    - Verify the diagram shows the active breakpoint node
    - Verify the diagram highlights the current execution point

---

### 8. View variables at breakpoint (Description: Inspect variable values)

**Steps:**
1. Start a debug session
2. Add a breakpoint and hit it (from previous scenarios)
3. Verify execution is paused at the breakpoint
4. Open the Variables panel (if not already open)
5. Verify the Variables panel displays variable names and values
6. Verify local variables are shown
7. Verify parameter values are shown
8. Verify variable values are correctly displayed
9. Expand complex variables to see their properties
10. **Verify the source generated:**
    - Verify the variable values match the source code state
    - Verify the variables are correctly scoped at the breakpoint
11. **Verify the diagram:**
    - Verify the diagram shows variable information (if applicable)
    - Verify the diagram reflects the variable state at the breakpoint

---

### 9. Step over (Description: Execute F10 step over)

**Steps:**
1. Start a debug session
2. Hit a breakpoint (execution is paused)
3. Verify the current execution line is visible
4. Press F10 or click the "Step Over" button in the debug toolbar
5. Verify execution moves to the next line
6. Verify the execution line indicator moves forward
7. Verify the diagram updates to show the new execution point (if applicable)
8. Verify variables are updated (if changed)
9. **Verify the source generated:**
    - Verify the step over correctly executes the current line
    - Verify the source code reflects the new execution position
10. **Verify the diagram:**
    - Verify the diagram shows the updated execution point
    - Verify the diagram reflects the step over operation

---

### 10. Step into (Description: Execute F11 step into)

**Steps:**
1. Start a debug session
2. Hit a breakpoint (execution is paused)
3. Verify the current execution line is visible
4. Position the cursor on a function call (if stepping into a function)
5. Press F11 or click the "Step Into" button in the debug toolbar
6. Verify execution enters the function (if applicable)
7. Verify the execution line moves to the first line of the function
8. Verify the call stack shows the new function
9. Verify the diagram updates to show the function entry (if applicable)
10. **Verify the source generated:**
    - Verify the step into correctly enters the function
    - Verify the source code shows the function's first line
11. **Verify the diagram:**
    - Verify the diagram shows the function entry point
    - Verify the diagram reflects the step into operation

---

### 11. Step out (Description: Execute Shift+F11 step out)

**Steps:**
1. Start a debug session
2. Step into a function (from previous scenario)
3. Verify execution is inside the function
4. Press Shift+F11 or click the "Step Out" button in the debug toolbar
5. Verify execution returns to the calling function
6. Verify the execution line moves to the line after the function call
7. Verify the call stack removes the current function
8. Verify the diagram updates to show the return point (if applicable)
9. **Verify the source generated:**
    - Verify the step out correctly returns from the function
    - Verify the source code shows the return point
10. **Verify the diagram:**
    - Verify the diagram shows the return to the calling function
    - Verify the diagram reflects the step out operation

---

### 12. Continue execution (Description: Execute F5 continue)

**Steps:**
1. Start a debug session
2. Hit a breakpoint (execution is paused)
3. Verify execution is paused
4. Press F5 or click the "Continue" button in the debug toolbar
5. Verify execution resumes
6. Verify execution continues until the next breakpoint (if any)
7. Verify execution completes if no more breakpoints
8. Verify the debug toolbar shows running state
9. **Verify the source generated:**
    - Verify the execution continues from the breakpoint
    - Verify the source code execution proceeds correctly
10. **Verify the diagram:**
    - Verify the diagram shows execution continuing
    - Verify the diagram reflects the continue operation

---

### 13. Stop debug session (Description: Click stop or Shift+F5)

**Steps:**
1. Start a debug session
2. Verify the debug session is active
3. Press Shift+F5 or click the "Stop" button in the debug toolbar
4. Verify the debug session stops
5. Verify the debug toolbar disappears or shows stopped state
6. Verify execution is terminated
7. Verify breakpoints remain set (for next debug session)
8. Verify the terminal shows debug session termination
9. **Verify the source generated:**
    - Verify the debugger correctly detaches from the source
    - Verify the source code is no longer in debug mode
10. **Verify the diagram:**
    - Verify the diagram shows debug session stopped
    - Verify the diagram no longer shows debug indicators

---

### 14. Debug from command palette (Description: Execute BI.project.debug command)

**Steps:**
1. Open the Command Palette (Ctrl+Shift+P / Cmd+Shift+P)
2. Type "BI.project.debug" or "Debug Integration"
3. Verify the command is listed
4. Select the "BI.project.debug" command
5. Verify the command executes
6. Verify the debug session starts
7. Verify the debug toolbar appears
8. Verify the debugger attaches to the project
9. **Verify the source generated:**
    - Verify the command correctly starts debugging
    - Verify the source files are loaded for debugging
10. **Verify the diagram:**
    - Verify the diagram shows debug mode
    - Verify the diagram reflects the debug session start

---

### 15. View call stack (Description: See call stack panel)

**Steps:**
1. Start a debug session
2. Step into a function (create a call stack)
3. Hit a breakpoint inside a nested function
4. Open the Call Stack panel (if not already open)
5. Verify the Call Stack panel displays the call hierarchy
6. Verify the current function is at the top of the stack
7. Verify parent functions are listed below
8. Click on a stack frame to navigate to that function
9. Verify the source code navigates to the selected stack frame
10. **Verify the source generated:**
    - Verify the call stack correctly represents the execution path
    - Verify the source code navigation matches the call stack
11. **Verify the diagram:**
    - Verify the diagram shows the call stack path (if applicable)
    - Verify the diagram reflects the current execution context

---

## Notes

- Breakpoints can be set in both source code and diagram views
- Breakpoints synchronize bidirectionally between source and diagram
- The debugger supports standard debugging operations (step over, step into, step out, continue)
- Variables are inspected at breakpoints in the Variables panel
- The call stack shows the execution path through function calls
- Debug sessions can be started from toolbar or command palette
- Breakpoints persist across debug sessions until manually removed

