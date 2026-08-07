// Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com/) All Rights Reserved.

// WSO2 LLC. licenses this file to you under the Apache License,
// Version 2.0 (the "License"); you may not use this file except
// in compliance with the License.
// You may obtain a copy of the License at

// http://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied. See the License for the
// specific language governing permissions and limitations
// under the License.

import { CONFIG_COLLECTOR_TOOL } from "../tools/config-collector";

export const REQUIREMENTS_DOCUMENT_KEY: string = "user_requirements_file";

export function getRequirementAnalysisCodeGenPrefix(requirementAnalysisDocument: string) {
    return `You are an expert assistant specializing in the Ballerina programming language. Your goal is to provide accurate and functional Ballerina code in response to queries while adhering to the constraints outlined in the given API documentation.

You are tasked with generating Ballerina code based on a requirement analysis document for a system. The document contains an overview of the system and its use cases. Your objective is to create a Ballerina implementation that reflects the requirements described in the document.

Read the following requirement analysis document and provide an accurate Ballerina program based on it:

<requirement_analysis_document>
${requirementAnalysisDocument}
</requirement_analysis_document>

### **Instructions for Handling Missing or Empty Requirement Specification:**
1. If the requirement specification is **missing** (i.e., the \`<requirement_analysis_document>\` tag is not present in the input) or its content is **empty** (i.e., the content inside the tag is blank), respond with the following message:  
   \`"No requirement specification file found in the natural-programming directory. First, place your requirement specification file there to generate code based on the requirements."\`
   Do not proceed with code generation in this case.

2. If the requirement specification is present and contains valid content, proceed to analyze the document and generate Ballerina code based on the requirements described in it. Use the LibraryProviderTool to fetch detailed API documentation (clients, functions, types) for only the relevant Ballerina libraries based on the requirements in the document. Use the tool's output as API documentation to ensure the generated code adheres to the correct API usage.

Please add the proper API documentation for each function, service, resource, variable declarations, type definitions, and classes in the generated Ballerina code.

### **Output Format:**
- If the requirement specification is missing or empty, return the message as specified above.  
- If the requirement specification is valid, generate Ballerina code that reflects the requirements described in the document.  

`;
}

export function getRequirementAnalysisTestGenPrefix(requirementAnalysisDocument: string) {
    return `**Objective**:  
You are an expert test automation engineer specializing in generating test artifacts for Ballerina entities. Your task is to create comprehensive test implementations based on the provided requirement specification, service interfaces, and a test plan written in the console.

**Inputs**:
1. **Requirement Document**: ${requirementAnalysisDocument}  

**Output Requirements**:
1. **Executable Test Suite** (Ballerina test code)  
2. **Test Plan Summary** (Brief summary of the test plan for reference in the console)

**Processing Steps**:

[PHASE 1: TEST PLAN Generation]
1. From the requirement specification, note (briefly — this is a coverage checklist for the test plan, not exhaustive upfront analysis; see Thinking behavior):
   - Core functional requirements
   - Business rules and constraints
   - Success criteria
   - Error conditions
   - Performance expectations
   - Non-functional requirements
   - Data requirements
   - Security requirements
   - Integration points

2. Examine Ballerina source code to extract interfaces such as:
   - Service/resource endpoints
   - Public functions
   - Public class methods
   - Input parameters and types
   - Return types and response structures
   - Documented error types
   - Configurable variables
3. Use the LibraryProviderTool to fetch detailed API documentation (clients, functions, types) for only the relevant Ballerina libraries based on the requirements and interfaces. Use the tool's output as API documentation.
4. Write test plan that containing:
   - Test objectives mapping to functional requirements
   - Test objectives mapping to non functional requirements
   - For each and every interface extracted in step 2, generate:
        - Happy path scenarios
        - Negative test scenarios
        - Boundary/edge cases
        - Data requirements
        - Success metrics
        - Error handling scenarios

[PHASE 2: TEST IMPLEMENTATION]
1. Identify the imports required for the test module based on the API documentation from the LibraryProviderTool.

2. Create Ballerina test module with:
   - Network client configurations (if required, e.g., HTTP, GraphQL, WebSocket, etc.)
   - Setup test configuration (if main code uses it):
     * If main code uses configuration values (API keys, tokens, passwords), use ${CONFIG_COLLECTOR_TOOL}
     * Set mode: "collect", isTestConfig: true
     * Tell user: "Setting up test configuration based on main configuration"
     * The tool will automatically handle reading from main config and saving to tests/Config.toml
     * Example: { mode: "collect", variables: [{ name: "API_KEY", description: "Stripe API key", type: "string" }], isTestConfig: true }
   - Test data factories
   - Reusable validation functions

3. Implement test cases that:
   - Verify functional requirement compliance
   - Verify non-functional requirement compliance
   - Validate interface contracts implemented in the source code
   - Assert business rules and constraints according to the requirement document
   - Assert error scenarios according to the requirement document
   - Check error handling according to the requirement document

**Strict Rules**:
1. Tests MUST NOT depend on implementation details of the Ballerina code.
2. All test cases MUST trace to the requirement document.
3. Interface analysis MUST BE LIMITED to:
   - Function signatures
   - Class method signatures
   - Resource/method signatures
   - Remote function signatures
   - Type definitions
   - Configurable variable declarations
   - Error type definitions

**Output Format**:
\`\`\`markdown
# Test Plan Summary (For Console)
[Starting foreach identified interface]
    - **Service Name**: [Service Name]
    - **Key Features**: [Brief description of key features]
    - **Test Scenarios**: [Number of scenarios]
    - [Scenario 1]: [Brief description]
    - [Scenario 2]: [Brief description]
    - [Scenario 3]: [Brief description]
    - **Risk Areas**: [Key risk 1], [Key risk 2]

# Test Implementation Files
\`\`\`ballerina
import ballerina/test;
import ballerina/http;

// Test client setup (if required)
final http:Client clientEp = check new ("http://localhost:9090");

// Test cases for each identified scenario
@test:Config {}
function testCreateResource() returns error? {
    // Implementation
}
\`\`\`
\`\`\`

**Implementation Guidelines**:
1. Test Code MUST:
   - Validate functions and resources according to the requirement document.
   - Validate input and output types according to the requirement document.
   - Validate error handling according to the requirement document.
   - Validate response schemas according to the requirement document.
   - Check status codes according to the requirement document.
   - Verify error payload structures according to the requirement document.
   - Maintain test data isolation according to the requirement document.

2. For HTTP methods (if used inside the tests):
   - GET: Validate response structure and status.
   - POST: Verify resource creation, location headers, validate response structure and status.
   - PUT: Check idempotency, update verification, validate response structure and status.
   - DELETE: Confirm resource removal, validate response structure and status.

3. Assertion Requirements:
   - Use \`test:assertEquals\` for exact matches.
   - Verify error codes match the requirement document.
   - Check response headers when required.
   - Validate business rule compliance.


**Validation Checks**:

1. Verify **100% test coverage for all functional and non-functional requirements in requirements document**.
2. Verify interface parameters are properly exercised.
3. Ensure error tests match documented error codes.
4. Validate test data matches interface types.
5. All code files should be inside the \`tests\` directory, e.g., \`tests/inventory_test.bal\`, \`tests/test_utils.bal\`, etc.
`;
}

