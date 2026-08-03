# AI Copilot Generation - Test Specification

## Application Overview

The AI Copilot Generation feature in WSO2 Integrator: BI allows users to generate Ballerina code using AI assistance. Users can generate code from natural language descriptions, create hello world examples, and transform existing code (e.g., change to HTTP service). The generation feature is accessible from the Design section via the "Generate" button and requires users to be logged in to WSO2 Integrator Copilot (either via BI Intel or BYOK).

## UI Elements Identified

### Buttons and Actions
- **Generate** button (text: "Generate", icon: ✨) - in Design section of BI overview
- **Open AI Panel** button (icon: 🤖) - in BI editor toolbar
- **Send** button - in AI chat/input interface
- **Accept** button - to accept generated code
- **Reject** button - to reject generated code
- **Edit** button - to edit generated code before accepting

### Generation Interface Elements
- **AI Chat/Input field** - text area for entering generation prompts
- **Generation prompt** - natural language description of what to generate
- **Generated code preview** - shows AI-generated code
- **Code diff view** - shows changes to existing code
- **Loading indicator** - shows while AI is generating code
- **Error message** - displays if generation fails

### Generation Options
- **Generate from scratch** - create new code
- **Modify existing code** - transform existing code
- **Code suggestions** - AI-provided code suggestions

## Missing Test IDs Recommendations

The following test IDs should be added for better testability:

1. `data-testid="generate-button"`
2. `data-testid="ai-chat-input-field"`
3. `data-testid="send-generation-request-button"`
4. `data-testid="generated-code-preview"`
5. `data-testid="code-diff-view"`
6. `data-testid="accept-generated-code-button"`
7. `data-testid="reject-generated-code-button"`
8. `data-testid="edit-generated-code-button"`
9. `data-testid="generation-loading-indicator"`
10. `data-testid="generation-error-message"`
11. `data-testid="generation-prompt-field"`

## Test Scenarios

### 1. Generate Hello world (Description: Generate a hello world)

**Steps:**
1. Ensure user is logged in to WSO2 Integrator Copilot (BI Intel or BYOK)
2. Navigate to BI extension view
3. Verify "Generate" button is visible in Design section
4. Click on "Generate" button
5. Verify AI generation interface opens
6. Enter generation prompt: "Generate a hello world service"
7. Click "Send" or press Enter
8. Verify loading indicator appears
9. Verify AI processes the request
10. Verify generated code preview appears
11. Verify generated code contains hello world service
12. Verify code includes HTTP service with /hello path
13. Verify code includes resource function that returns "Hello, World!"
14. Review generated code
15. Click "Accept" button to apply generated code
16. Verify generated code is added to project
17. Verify new service file is created (or code is added to existing file)
18. Verify diagram is updated with new service
19. **Verify the source generated:**
    - Verify generated code is valid Ballerina syntax
    - Verify code includes necessary imports (e.g., `import ballerina/http;`)
    - Verify service is correctly defined
    - Verify resource function is correctly implemented
    - Verify code follows Ballerina best practices
20. **Verify the diagram:**
    - Verify hello world service appears in diagram
    - Verify service node shows correct base path
    - Verify resource node is displayed
    - Verify diagram structure matches generated code

---

### 2. Change to Hello world API (Description: Change the existing code to HTTP service)

**Steps:**
1. Ensure user is logged in to WSO2 Integrator Copilot
2. Create or open an existing Ballerina file with some code
3. Navigate to BI extension view
4. Click on "Generate" button
5. Verify AI generation interface opens
6. Enter generation prompt: "Change this code to a hello world HTTP service"
7. Verify existing code context is included in the request
8. Click "Send" or press Enter
9. Verify loading indicator appears
10. Verify AI processes the request with existing code context
11. Verify generated code preview appears
12. Verify code diff view shows changes to existing code
13. Verify generated code transforms existing code to HTTP service
14. Verify generated code includes HTTP service structure
15. Verify generated code includes /hello path
16. Verify generated code includes resource function returning "Hello, World!"
17. Review the code changes in diff view
18. Verify removed code is highlighted (if any)
19. Verify added code is highlighted
20. Click "Accept" button to apply changes
21. Verify existing code is updated
22. Verify code is transformed to HTTP service
23. Verify diagram is updated to show HTTP service
24. **Verify the source generated:**
    - Verify existing code is correctly modified
    - Verify HTTP service structure is correctly added
    - Verify code transformation is valid
    - Verify no syntax errors are introduced
    - Verify imports are updated if needed
25. **Verify the diagram:**
    - Verify diagram reflects the code transformation
    - Verify HTTP service node appears in diagram
    - Verify old code structure is removed from diagram
    - Verify new service structure is correctly displayed

---

## Notes

- AI generation requires authentication (BI Intel or BYOK)
- Generated code should be reviewed before accepting
- The AI uses context from the current project and existing code
- Code generation supports both creating new code and modifying existing code
- Generated code follows Ballerina language conventions and best practices
- The generation process may take several seconds depending on complexity
- Users can edit generated code before accepting
- Code diff view helps users understand what changes will be made
- The diagram is automatically updated when generated code is accepted

