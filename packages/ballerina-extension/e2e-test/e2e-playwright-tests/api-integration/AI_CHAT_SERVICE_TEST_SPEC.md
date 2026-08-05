# AI Chat Service - Test Specification

## Application Overview

The AI Chat Service (Chat Agent Service) feature in WSO2 Integrator: BI allows users to create AI-powered chat services that can interact with AI models. The service can be configured with AI model settings and chat capabilities.

## UI Elements Identified

### Buttons and Actions
- **Add Artifact** button (text: "Add Artifact", icon: ➕)
- **Chat Agent Service** option in Artifacts menu (under "AI Integration" section)
- **Create** button (in service creation form)
- **Cancel** button (in service creation form)
- **Configure** button (text: "Configure", icon: ⚙️) - for editing service
- **Delete** button (icon: 🗑️) - for deleting service
- **Manage Accounts** button (for AI platform authentication)

### Form Fields
- **Service Name** input field (optional)
- **AI Model Configuration** section:
  - **Model Selection** dropdown or input
  - **API Key** input field (if required)
  - **Model Parameters** fields
- **Chat Configuration** fields
- **Advanced Configurations** expandable section (if available)

### Navigation Elements
- **Overview** breadcrumb
- **Artifacts** breadcrumb
- **Service** breadcrumb
- **Service Designer** breadcrumb

### Tree View Elements
- **Entry Points** section
- **Chat Agent Service** tree item
- **AI Integration** section (if separate)

### Authentication Elements
- **Login to WSO2 AI Platform** banner (if not authenticated)
- **Manage Accounts** button
- **Close** button (on login banner)

## Missing Test IDs Recommendations

The following test IDs should be added for better testability:

1. `data-testid="ai-chat-agent-option"`
2. `data-testid="ai-service-name-input"`
3. `data-testid="ai-model-select"`
4. `data-testid="ai-api-key-input"`
5. `data-testid="create-ai-chat-service-button"`
6. `data-testid="configure-ai-chat-service-button"`
7. `data-testid="delete-ai-chat-service-button"`
8. `data-testid="manage-accounts-button"`
9. `data-testid="ai-model-parameters-section"`

---

## Test Scenarios

### 1. Create AI Chat Service

**Description:** Creates AI chat service

**Prerequisites:**
- BI extension is active
- Test project is open
- WSO2 AI Platform account is authenticated (if required)

**Steps:**
1. Click on the "WSO2 Integrator: BI" tab in the sidebar
2. Verify the project tree shows "TestIntegration" project
3. If "Login to WSO2 AI Platform" banner is displayed, click on "Manage Accounts" and complete authentication
4. Click on the "Add Artifact" button
5. Verify the Artifacts menu is displayed
6. Under "AI Integration" section, click on "Chat Agent Service" option
7. Verify the "Create Chat Agent Service" form is displayed
8. (Optional) Enter service name "myChatAgent" in the "Service Name" field
9. Configure AI model settings:
   - Select AI model from dropdown (if available)
   - Enter API key if required (or verify it uses authenticated account)
10. Configure chat settings if available
11. Click on "Advanced Configurations" to expand (if available)
12. Click on "Create" button
13. Verify the service is created successfully

**Expected Results:**
- AI Chat Service is created
- Service appears in the "Entry Points" section of the project tree as "Chat Agent Service" (or custom name)
- Service designer view is displayed
- AI model configuration is saved
- Service is ready to use

**Element Identifiers:**
- Add Artifact button: `button[aria-label*="Add Artifact"]` or `button:has-text("Add Artifact")`
- Chat Agent Service option: `div:has-text("Chat Agent Service")` (in Artifacts menu, under "AI Integration")
- Service Name input: `input[name*="Service Name"]` or `textbox[name*="Name"]`
- Model select: `select[name*="Model"]` or dropdown
- Create button: `button:has-text("Create")`
- Service tree item: `treeitem:has-text("Chat Agent Service")`

---

### 2. Configure AI Model

**Description:** Set up AI model configuration

**Prerequisites:**
- AI Chat Service exists

**Steps:**
1. Verify AI Chat Service is open in the service designer
2. Click on the "Configure" button (⚙️ icon) in the service designer toolbar
3. Verify the service configuration form is displayed
4. Locate the "AI Model Configuration" section
5. Select a different AI model from the dropdown (if available)
6. Update model parameters if available:
   - Temperature
   - Max tokens
   - Other model-specific parameters
7. Update API key if required (or verify authentication)
8. Click on "Save" or "Create" button
9. Verify the AI model configuration is updated

**Expected Results:**
- AI model configuration is updated
- Service designer shows the new model settings
- Model parameters are saved

**Element Identifiers:**
- Configure button: `button:has-text("Configure")` or `button[aria-label*="Configure"]`
- Model select: `select[name*="Model"]` or `dropdown[name*="Model"]`
- Temperature input: `input[name*="Temperature"]` or `textbox[name*="Temperature"]`
- Max tokens input: `input[name*="Max Tokens"]` or `textbox[name*="Max Tokens"]`
- Save button: `button:has-text("Save")` or `button:has-text("Create")`

---

### 3. Edit AI Chat Service

**Description:** Modify AI service settings

**Prerequisites:**
- AI Chat Service exists

**Steps:**
1. Verify AI Chat Service exists in the "Entry Points" section
2. Click on the service tree item to open service designer
3. Click on the "Configure" button
4. Verify the service configuration form is displayed
5. Modify service name if needed
6. Update AI model configuration if needed
7. Update chat settings if available
8. Click on "Save" button
9. Verify the service is updated

**Expected Results:**
- AI Chat Service settings are updated
- Service name is updated (if changed)
- Configuration changes are saved
- Service maintains updated settings

**Element Identifiers:**
- Configure button: `button:has-text("Configure")`
- Service Name input: `input[name*="Service Name"]`
- Save button: `button:has-text("Save")`

---

### 4. Delete AI Chat Service

**Description:** Delete service and verify cleanup

**Prerequisites:**
- AI Chat Service exists

**Steps:**
1. Verify AI Chat Service exists in the "Entry Points" section
2. Click on the service tree item
3. Verify the service is selected
4. Locate the "Delete" button (🗑️ icon) in the toolbar or context menu
5. Click on "Delete" button
6. If confirmation dialog appears, confirm the deletion
7. Verify the service is removed

**Expected Results:**
- AI Chat Service is deleted
- Service no longer appears in the "Entry Points" section
- Service file is removed from the project (if applicable)
- Project tree updates to reflect the deletion

**Element Identifiers:**
- Service tree item: `treeitem:has-text("Chat Agent Service")`
- Delete button: `button[aria-label*="Delete"]` or toolbar button with delete icon

---

## Additional Test Scenarios (Edge Cases)

### 5. Create AI Chat Service Without Authentication

**Steps:**
1. Ensure user is not authenticated to WSO2 AI Platform
2. Click on "Add Artifact" → "Chat Agent Service"
3. Verify "Login to WSO2 AI Platform" banner or warning is displayed
4. Click on "Manage Accounts" button
5. Complete authentication process
6. Return to service creation
7. Verify service creation form is accessible

**Expected Results:**
- Authentication prompt is displayed
- User can authenticate via "Manage Accounts"
- After authentication, service creation is possible

### 6. Create AI Chat Service with Invalid Model Configuration

**Steps:**
1. Click on "Add Artifact" → "Chat Agent Service"
2. Leave required model fields empty or enter invalid values
3. Click on "Create" button
4. Verify validation error is displayed

**Expected Results:**
- Validation error message is shown
- Service is not created
- Error message indicates the issue

### 7. Configure AI Model with Invalid Parameters

**Steps:**
1. Open existing AI Chat Service
2. Click on "Configure"
3. Enter invalid parameter values (e.g., temperature > 1, negative max tokens)
4. Click on "Save"
5. Verify validation error is displayed

**Expected Results:**
- Validation error is shown for invalid parameters
- Configuration is not saved
- Error message indicates valid ranges

### 8. Cancel AI Chat Service Creation

**Steps:**
1. Click on "Add Artifact" → "Chat Agent Service"
2. Enter service name and configuration
3. Click on "Cancel" button
4. Verify form is closed

**Expected Results:**
- Service creation form is closed
- No service is created
- Project tree remains unchanged

---

## Test Data

### Valid Service Names
- "myChatAgent"
- "customerSupportBot"
- "aiAssistant"
- "chatService1"

### AI Models (Examples - actual models may vary)
- "gpt-4"
- "gpt-3.5-turbo"
- "claude-3"
- Model names from WSO2 AI Platform

### Valid Model Parameters
- Temperature: 0.0 to 1.0 (or 2.0 depending on model)
- Max Tokens: 1 to model maximum (e.g., 4096, 8192)
- Top P: 0.0 to 1.0
- Frequency Penalty: -2.0 to 2.0
- Presence Penalty: -2.0 to 2.0

### Invalid Model Parameters
- Temperature: < 0 or > 2 (depending on model)
- Max Tokens: 0 or negative
- Invalid API key format

---

## Notes

1. AI Chat Service requires WSO2 AI Platform authentication
2. Service may show "Login to WSO2 AI Platform" banner if not authenticated
3. AI model options depend on available models in WSO2 AI Platform
4. Model parameters vary by AI model type
5. API key may be required or may use authenticated account credentials
6. Delete operations may require confirmation - handle dialogs appropriately
7. Test IDs are recommended but may not be present - use alternative selectors (text, aria-labels, etc.)
8. AI Chat Service may have different configuration options compared to other service types
9. Service may need to be tested with actual AI model to verify functionality
10. Authentication state may affect available features and options

---

## Authentication Flow

### Login to WSO2 AI Platform

**Steps:**
1. If "Login to WSO2 AI Platform" banner is displayed
2. Click on "Manage Accounts" button
3. Complete authentication in the accounts dialog
4. Verify authentication is successful
5. Return to service creation/configuration

**Expected Results:**
- User is authenticated to WSO2 AI Platform
- Login banner is dismissed
- AI features are accessible

**Element Identifiers:**
- Manage Accounts button: `button:has-text("Manage Accounts")`
- Close button: `button:has-text("Close")` (on login banner)

