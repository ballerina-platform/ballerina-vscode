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

import { DocumentationGenerationRequest } from "./index";
import { ModelMessage } from "ai";
import { flattenProjectToText, getExternalTypesAsJsonSchema } from "./utils";
import type { ProviderCacheOptions } from "../utils/ai-client";

// ==============================================
//            SYSTEM PROMPTS
// ==============================================

export function getDocumentationGenerationSystemPrompt(): string {
  return `You are an expert technical writer and API documentation specialist with deep expertise in Ballerina services and REST API documentation. Your task is to analyze Ballerina source code and OpenAPI specifications to generate comprehensive, developer-focused documentation for APIs.

Your documentation should be:
1. **Developer-Centric**: Written for API consumers and integrators
2. **Comprehensive**: Cover all endpoints, request/response formats, and error scenarios
3. **Practical**: Include short, real examples - not comprehensive but concise and realistic
4. **Professional**: Follow industry standards for API documentation
5. **Clear and Concise**: Easy to understand and navigate

Focus on creating documentation that helps developers quickly understand:
- What the API does and its purpose
- How to authenticate and get started
- Available endpoints and their functionality
- Request/response formats with short, realistic examples
- Error handling and status codes
- Integration patterns and best practices`;
}

// ==============================================
//            DOCUMENTATION GENERATION PROMPTS
// ==============================================

export function getDocumentationGenUser1Prompt(serviceCode: string, typeSchemas: string, serviceName: string): string {
  return `Generate professional developer documentation for a Ballerina REST API service. I will provide you with:
1. The complete Ballerina service implementation
2. OpenAPI type schemas for external dependencies
3. The target service name for documentation

Please analyze the code and create clean, professional API documentation following industry standards.

**Service Name**: ${serviceName}

**Ballerina Source Code**:
[BEGIN_SOURCE]
${serviceCode}
[END_SOURCE]

**Type Schemas for External Libraries**:
[BEGIN_SCHEMAS]
${typeSchemas}
[END_SCHEMAS]

Generate documentation following this professional structure:

---

# [SERVICE_NAME] Service API – Developer Documentation

The [SERVICE_NAME] Service API enables developers to [describe core functionality]. The API is designed to be simple, secure, and scalable.

[Determine the actual service name from the code context - look at service class names, comments, resource paths, data models, and business logic to infer what this service does (e.g., "Pizza Shop", "User Management", "Inventory", etc.) rather than using the base path directly]

[Only include Base URLs if they can be determined from the service configuration or listener setup in the code]
* **Format:** JSON over HTTP/HTTPS
* **Authentication:** [Only include if authentication is implemented in the code]

---

## Getting Started

### Authentication

[Only include this section if authentication mechanisms are actually implemented in the Ballerina service code]

---

## Core Concepts

* **[Concept 1]** – [Brief description of key domain objects/concepts]
* **[Concept 2]** – [Brief description of key domain objects/concepts]
* **[Concept 3]** – [Brief description of key domain objects/concepts]

---

## API Reference

### [Resource Group Name]

**[Endpoint Description]**
\`[HTTP_METHOD] [/endpoint/path]\`

[Brief description of what this endpoint does]

**Example:**

\`\`\`bash
curl [BASE_URL_FROM_CODE]/[endpoint] \\
  -H "Content-Type: application/json"
\`\`\`

**Response:**

\`\`\`json
{
  "example": "response data"
}
\`\`\`

**Parameters:**
- **Path Parameters:**
  - \`param_name\` (type) – Description
- **Query Parameters:**
  - \`param_name\` (type) – Description
- **Request Body:**

\`\`\`json
{
  "field": "value"
}
\`\`\`

[Repeat for each endpoint grouped logically]

---

## Error Handling

All error responses follow a standard structure:

\`\`\`json
{
  "error": "error_code",
  "message": "Human readable error message."
}
\`\`\`

**Error Codes:**

* \`400 Bad Request\` – Invalid request format.
* \`401 Unauthorized\` – Missing or invalid credentials.
* \`404 Not Found\` – Resource not found.
* \`429 Too Many Requests\` – Rate limit exceeded.
* \`500 Internal Server Error\` – Unexpected server error.

---

## Data Models

### [ModelName]

\`\`\`json
{
  "field1": "string",
  "field2": 123,
  "field3": true,
  "field4": {
    "nested_field": "value"
  }
}
\`\`\`

**Field Descriptions:**
- \`field1\` (string) – Description of the field
- \`field2\` (number) – Description of the field
- \`field3\` (boolean) – Description of the field

[Document all key data structures]

---

## Best Practices

* Use the **development environment** for testing before switching to production.
* Implement **retries with exponential backoff** for transient errors.
* Use **pagination** when retrieving large datasets.
* Store API keys securely; never commit them to version control.
* Handle errors gracefully and provide meaningful feedback to users.

---

Important Guidelines:
1. **Determine Service Name Intelligently**: Analyze the code to infer what the service does rather than using base paths like "/". Look for:
   - Service class names and comments
   - Resource endpoint patterns (e.g., /pizzas, /orders → "Pizza Shop")
   - Data model names (e.g., Pizza, Customer, Order → "Pizza Shop")
   - Business logic and functionality
   - Variable names and types
   - Generate meaningful names like "Pizza Shop", "User Management", "Inventory Management" instead of "/" or generic terms
2. Remove any informal language, emojis, or casual greetings
3. Extract actual endpoint paths, methods, and parameters from the Ballerina code
4. Generate realistic example data based on the types defined in the code - keep examples SHORT and REAL, not comprehensive
5. Include all resource functions as separate endpoint documentation
6. Use proper HTTP status codes based on the service implementation
7. Make examples practical, concise, and realistic - avoid overly complex or lengthy examples
8. Focus on what developers need to know to integrate successfully
9. Group related endpoints logically under sections
10. Use clean, professional language suitable for technical documentation
11. Follow the structure shown above strictly for consistency
12. DO NOT include hardcoded URLs - only include Base URLs if they can be determined from service listeners/configuration in the actual code
13. DO NOT include Authentication section unless authentication is actually implemented in the service
14. Generate ONLY the documentation content - no completion messages or additional text`;
}

// ==============================================
//            MESSAGE CREATION FUNCTIONS
// ==============================================

export function createDocumentationGenMessages(request: DocumentationGenerationRequest, cacheOptions: ProviderCacheOptions): ModelMessage[] {
  const docGenUser1 = createDocumentationGenUser1Message(request, cacheOptions);
  return [docGenUser1];
}

export function createDocumentationGenUser1Message(request: DocumentationGenerationRequest, cacheOptions: ProviderCacheOptions): ModelMessage {
  const flattenedProject = flattenProjectToText(request.projectSource);
  const typeSchemas = request.openApiSpec ? getExternalTypesAsJsonSchema(request.openApiSpec) : "{}";

  const prompt = getDocumentationGenUser1Prompt(flattenedProject, typeSchemas, request.serviceName);

  return {
    role: "user",
    content: prompt,
    providerOptions: cacheOptions,
  };
}
