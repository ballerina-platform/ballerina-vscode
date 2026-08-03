# Run Integration - Test Specification

## Application Overview

The Run Integration feature in WSO2 Integrator: BI allows users to execute Ballerina integrations directly from the editor. The feature executes the `bal run` command in the terminal, displays process output, handles missing configurations, supports multiple services, and provides process management capabilities including stopping running processes.

## UI Elements Identified

### Buttons and Actions
- **Run Integration** button (text: "Run Integration", icon: ▶) - in editor toolbar
- **Stop** button (icon: ⏹) - in terminal toolbar (when process is running)
- **Terminal** panel - VS Code integrated terminal
- **Command Palette** - for executing `BI.project.run` command

### Terminal Elements
- **Terminal output** - displays `bal run` command execution
- **Process status** - shows running/stopped state
- **Error messages** - displays configuration errors and runtime errors
- **Success messages** - displays successful execution messages

### Configuration Elements
- **Missing configuration popup** - dialog shown when required configs are missing
- **Configuration file** - `Config.toml` or `config.bal` for project configuration

## Missing Test IDs Recommendations

The following test IDs should be added for better testability:

1. `data-testid="run-integration-button"`
2. `data-testid="debug-integration-button"`
3. `data-testid="terminal-panel"`
4. `data-testid="terminal-output"`
5. `data-testid="stop-process-button"`
6. `data-testid="missing-config-popup"`
7. `data-testid="config-file-input"`
8. `data-testid="run-command-output"`
9. `data-testid="process-status-indicator"`

## Test Scenarios

### 1. Click Run button from toolbar (Description: Click Run Integration button in editor toolbar)

**Steps:**
1. Navigate to WSO2 Integrator: BI view
2. Verify the "Run Integration" button is visible in the editor toolbar
3. Click on the "Run Integration" button
4. Verify the button is clicked successfully
5. Verify the terminal panel opens (if not already open)
6. Verify the `bal run` command is executed
7. **Verify the source generated:**
    - Verify the command executes the correct Ballerina project
    - Verify the project source files are correctly referenced
8. **Verify the diagram:**
    - Verify the integration diagram remains accessible during run
    - Verify no diagram errors occur during execution

---

### 2. Verify terminal opens (Description: Check VS Code terminal panel is visible)

**Steps:**
1. Click on the "Run Integration" button
2. Verify the VS Code terminal panel is visible
3. Verify the terminal panel is focused/active
4. Verify a new terminal instance is created (if applicable)
5. Verify the terminal shows the command being executed
6. Verify the terminal displays the working directory
7. **Verify the source generated:**
    - Verify the terminal shows the correct project path
    - Verify the terminal command matches the project structure
8. **Verify the diagram:**
    - Verify the terminal opens without affecting the diagram view
    - Verify the diagram remains accessible while terminal is open

---

### 3. Run with missing config (Description: Shows missing configurations popup)

**Steps:**
1. Ensure the project has missing required configurations
2. Click on the "Run Integration" button
3. Verify the terminal opens
4. Verify the `bal run` command is executed
5. Verify a missing configuration popup/dialog is displayed
6. Verify the popup shows which configurations are missing
7. Verify the popup provides options to add configurations
8. Verify error messages are displayed in the terminal
9. **Verify the source generated:**
    - Verify the source code correctly identifies missing configurations
    - Verify the configuration requirements are correctly detected
10. **Verify the diagram:**
    - Verify the diagram shows configuration-related errors (if applicable)
    - Verify the diagram remains accessible during configuration errors

---

### 4. Run after config added (Description: Successful run after adding config)

**Steps:**
1. Add the missing configurations (via Config.toml or config.bal)
2. Save the configuration file
3. Click on the "Run Integration" button
4. Verify the terminal opens
5. Verify the `bal run` command is executed
6. Verify no missing configuration popup is displayed
7. Verify the process starts successfully
8. Verify success messages are displayed in the terminal
9. Verify the integration runs without configuration errors
10. **Verify the source generated:**
    - Verify the configuration is correctly applied to the source
    - Verify the source code uses the configuration values correctly
11. **Verify the diagram:**
    - Verify the diagram reflects the configuration changes
    - Verify no configuration errors are shown in the diagram

---

### 5. Verify process starts (Description: Check bal run command executes)

**Steps:**
1. Click on the "Run Integration" button
2. Verify the terminal opens
3. Verify the `bal run` command is visible in the terminal
4. Verify the command executes successfully
5. Verify the process starts (check for process ID or running indicator)
6. Verify the terminal shows compilation messages (if applicable)
7. Verify the terminal shows startup messages
8. Verify services/listeners start successfully
9. **Verify the source generated:**
    - Verify the source code compiles successfully
    - Verify the generated executable runs correctly
10. **Verify the diagram:**
    - Verify the diagram shows active/running state (if applicable)
    - Verify the diagram reflects the running services

---

### 6. View run output (Description: See process output in terminal)

**Steps:**
1. Click on the "Run Integration" button
2. Verify the terminal opens
3. Verify the terminal displays the `bal run` command output
4. Verify compilation output is displayed (if applicable)
5. Verify runtime output is displayed
6. Verify service startup messages are shown
7. Verify log messages are displayed in the terminal
8. Verify error messages (if any) are displayed
9. Verify the output is scrollable
10. **Verify the source generated:**
    - Verify the output matches the source code execution
    - Verify the output reflects the correct service behavior
11. **Verify the diagram:**
    - Verify the diagram shows the execution flow (if applicable)
    - Verify the diagram reflects the output messages

---

### 7. Stop running process (Description: Terminate running integration)

**Steps:**
1. Start the integration using "Run Integration" button
2. Verify the process is running
3. Verify the terminal shows the running process
4. Click on the "Stop" button in the terminal toolbar (or use Ctrl+C)
5. Verify the process is terminated
6. Verify the terminal shows termination messages
7. Verify the process stops gracefully
8. Verify no orphaned processes remain
9. **Verify the source generated:**
    - Verify the source code handles termination correctly
    - Verify cleanup operations are executed (if applicable)
10. **Verify the diagram:**
    - Verify the diagram shows stopped state (if applicable)
    - Verify the diagram reflects the process termination

---

### 8. Run from command palette (Description: Execute BI.project.run command)

**Steps:**
1. Open the Command Palette (Ctrl+Shift+P / Cmd+Shift+P)
2. Type "BI.project.run" or "Run Integration"
3. Verify the command is listed
4. Select the "BI.project.run" command
5. Verify the command executes
6. Verify the terminal opens
7. Verify the `bal run` command is executed
8. Verify the process starts successfully
9. **Verify the source generated:**
    - Verify the command executes the correct project
    - Verify the source code is correctly referenced
10. **Verify the diagram:**
    - Verify the diagram remains accessible during command execution
    - Verify no diagram errors occur

---

### 9. Run with multiple services (Description: Run project with multiple HTTP services)

**Steps:**
1. Ensure the project contains multiple HTTP services
2. Click on the "Run Integration" button
3. Verify the terminal opens
4. Verify the `bal run` command is executed
5. Verify all services start successfully
6. Verify the terminal shows startup messages for each service
7. Verify each service is accessible on its configured port
8. Verify no port conflicts occur
9. Verify all services run concurrently
10. **Verify the source generated:**
    - Verify all services are correctly compiled
    - Verify all services are included in the executable
11. **Verify the diagram:**
    - Verify the diagram shows all running services
    - Verify the diagram reflects the multiple service configuration

---

### 10. Re-run after code change (Description: Hot reload or restart after edit)

**Steps:**
1. Start the integration using "Run Integration" button
2. Verify the process is running
3. Make a code change to a service file
4. Save the file
5. Verify the integration detects the change (if hot reload is supported)
6. If hot reload is supported:
   - Verify the changes are applied without restart
   - Verify the service continues running
7. If hot reload is not supported:
   - Verify the process needs to be restarted
   - Stop the current process
   - Click "Run Integration" again
   - Verify the new changes are applied
8. **Verify the source generated:**
    - Verify the updated source code is correctly compiled
    - Verify the changes are reflected in the running process
9. **Verify the diagram:**
    - Verify the diagram reflects the code changes
    - Verify the diagram shows updated service configuration

---

### 11. Run Automation task (Description: Execute scheduled automation)

**Steps:**
1. Ensure the project contains an Automation artifact
2. Click on the "Run Integration" button
3. Verify the terminal opens
4. Verify the `bal run` command is executed
5. Verify the Automation task starts
6. Verify the terminal shows Automation startup messages
7. Verify the Automation task executes according to its schedule
8. Verify Automation task output is displayed in the terminal
9. Verify the Automation task runs successfully
10. **Verify the source generated:**
    - Verify the Automation source code is correctly executed
    - Verify the Automation task logic runs as expected
11. **Verify the diagram:**
    - Verify the diagram shows the Automation task execution
    - Verify the diagram reflects the Automation flow

---

## Notes

- The Run Integration feature executes `bal run` command in the project directory
- Terminal output shows real-time execution logs
- Missing configurations are detected before or during execution
- The process can be stopped using the terminal stop button or Ctrl+C
- Multiple services can run concurrently in the same integration
- Hot reload support depends on Ballerina runtime capabilities
- Automation tasks execute according to their configured schedule

