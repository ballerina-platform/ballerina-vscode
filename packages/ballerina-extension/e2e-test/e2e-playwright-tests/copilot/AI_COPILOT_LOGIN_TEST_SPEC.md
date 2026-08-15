# AI Copilot Login - Test Specification

## Application Overview

The AI Copilot Login feature in WSO2 Integrator: BI allows users to authenticate with the AI Copilot service using two methods: BI Intel (OAuth/SSO login) or BYOK (Bring Your Own Key - API key authentication). Users must be logged in to access AI features such as code generation, artifact creation, and AI-assisted integration development. The login panel is accessible from the WSO2 Integrator Copilot view and provides options for both authentication methods.

## UI Elements Identified

### Buttons and Actions
- **Open AI Panel** button (icon: 🤖) - in BI editor toolbar
- **Login to WSO2 Integrator Copilot** button (text: "Login to WSO2 Integrator Copilot") - in WSO2 Integrator Copilot login panel
- **Enter your Anthropic API key** button (text: "Enter your Anthropic API key") - in WSO2 Integrator Copilot login panel
- **Enter your AWS Bedrock credentials** button (text: "Enter your AWS Bedrock credentials") - in WSO2 Integrator Copilot login panel
- **Manage Accounts** button (text: "Manage Accounts", icon: ⚙️) - in login prompt banner
- **Close** button (text: "Close", icon: ✕) - in login prompt banner

### Login Panel Elements
- **WSO2 Integrator Copilot Welcome** heading (text: "Welcome to WSO2 Integrator Copilot")
- **Description text** (text: "Integrate better with your AI pair.")
- **Legal notice** (text: "WSO2 Integrator Copilot uses AI to assist with integration. Please review all suggested content before adding it to your integration.")
- **Terms of Use** link - links to WSO2 AI Services Terms of Use
- **Divider** (text: "or") - separates login options

### Authentication Flow Elements
- **OAuth browser window** - opens for BI Intel login
- **API key input field** - for BYOK authentication
- **Save/Cancel buttons** - in API key input dialog
- **Login status indicator** - shows logged in/logged out state

## Missing Test IDs Recommendations

The following test IDs should be added for better testability:

1. `data-testid="open-ai-panel-button"`
2. `data-testid="bi-copilot-login-panel"`
3. `data-testid="login-to-bi-copilot-button"`
4. `data-testid="enter-anthropic-api-key-button"`
5. `data-testid="enter-aws-bedrock-credentials-button"`
6. `data-testid="manage-accounts-button"`
7. `data-testid="api-key-input-field"`
8. `data-testid="save-api-key-button"`
9. `data-testid="cancel-api-key-button"`
10. `data-testid="login-status-indicator"`
11. `data-testid="oauth-browser-window"`
12. `data-testid="terms-of-use-link"`

## Test Scenarios

### 1. Login - BI Intel (Description: Login to Copilot using BI Intel)

**Steps:**
1. Navigate to BI extension view
2. Click on "Open AI Panel" button in editor toolbar
3. Verify WSO2 Integrator Copilot panel opens
4. Verify login panel is displayed (if not already logged in)
5. Verify "Login to WSO2 Integrator Copilot" button is visible
6. Verify welcome message is displayed: "Welcome to WSO2 Integrator Copilot"
7. Verify description text is displayed: "Integrate better with your AI pair."
8. Click on "Login to WSO2 Integrator Copilot" button
9. Verify OAuth/SSO authentication flow is triggered
10. Verify browser window opens (or authentication dialog appears)
11. Complete authentication in browser/dialog
12. Verify authentication is successful
13. Verify login panel closes
14. Verify user is logged in to WSO2 Integrator Copilot
15. Verify AI features are now accessible
16. **Verify the source generated:**
    - Verify authentication credentials are stored securely
    - Verify access token is saved
    - Verify refresh token is saved (if applicable)
17. **Verify the diagram:**
    - Verify login state is reflected in diagram (if applicable)

---

### 2. Login - BYOK (Description: Login to Copilot using API KEY)

**Steps:**
1. Navigate to BI extension view
2. Click on "Open AI Panel" button in editor toolbar
3. Verify WSO2 Integrator Copilot panel opens
4. Verify login panel is displayed (if not already logged in)
5. Verify "Enter your Anthropic API key" button is visible
6. Click on "Enter your Anthropic API key" button
7. Verify API key input dialog/form appears
8. Verify API key input field is displayed
9. Enter a valid Anthropic API key
10. Verify API key is masked/hidden (for security)
11. Click "Save" or "OK" button
12. Verify API key is validated
13. Verify authentication is successful
14. Verify login panel closes
15. Verify user is logged in using API key
16. Verify AI features are now accessible
17. Verify API key authentication method is stored
18. **Verify the source generated:**
    - Verify API key is stored securely in VS Code secrets
    - Verify authentication method is saved as BYOK
    - Verify API key is not exposed in source code
19. **Verify the diagram:**
    - Verify login state is reflected in diagram (if applicable)

---

## Notes

- BI Intel login uses OAuth/SSO flow with WSO2 AI Platform
- BYOK (Bring Your Own Key) allows users to use their own Anthropic API key
- Authentication credentials are stored securely in VS Code secrets
- Users must be logged in to access AI generation features
- Login state persists across VS Code sessions
- Users can switch between login methods by logging out and logging in with a different method
- The login panel appears automatically when AI features are accessed without authentication

