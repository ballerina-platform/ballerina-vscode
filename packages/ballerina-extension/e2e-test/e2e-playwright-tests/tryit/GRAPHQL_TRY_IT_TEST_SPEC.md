# GraphQL Try It - Test Specification

## Application Overview

The GraphQL Try It feature in WSO2 Integrator: BI allows users to test GraphQL services directly from the service designer view. When users click the "Try Service" button on a GraphQL service, a GraphQL explorer view opens in a webview panel, providing an interactive interface to explore the GraphQL schema, build queries and mutations, execute them, and view responses. The explorer includes a schema browser, query builder, and response viewer. If the service is not running, a prompt appears to start the integration first.

## UI Elements Identified

### Buttons and Actions
- **Try Service** button (text: "Try Service", icon: 🧪) - in GraphQL Service Designer view
- **Try It** button - alternative name for Try Service button
- **Run Integration** button - in auto-start service prompt
- **Cancel** button - in auto-start service prompt
- **Execute Query** button - in GraphQL explorer
- **Execute Mutation** button - in GraphQL explorer
- **Schema Explorer** toggle/button - to view schema types and fields

### GraphQL Explorer View Elements
- **GraphQL Explorer** webview panel - opens when Try It is clicked
- **Schema Explorer** section - shows GraphQL schema types and fields
- **Query Builder** section - interface to build GraphQL queries
- **Mutation Builder** section - interface to build GraphQL mutations
- **Query Editor** - text area for writing GraphQL queries
- **Variables Editor** - text area for GraphQL query variables
- **Response Viewer** - displays query/mutation responses
- **Field Selection** - clickable fields in schema explorer to build queries
- **Type Browser** - shows GraphQL types (Query, Mutation, types, etc.)
- **Field Browser** - shows fields for each type

### Response Elements
- **Query Response** - JSON response from GraphQL query
- **Mutation Response** - JSON response from GraphQL mutation
- **Error Response** - error messages if query/mutation fails
- **Response Formatting** - pretty-printed JSON response

### Service Selection
- **Service URL** - displayed in GraphQL explorer (e.g., `http://localhost:9090/graphql`)

## Missing Test IDs Recommendations

The following test IDs should be added for better testability:

1. `data-testid="graphql-try-service-button"`
2. `data-testid="graphql-explorer-view"`
3. `data-testid="schema-explorer"`
4. `data-testid="query-builder"`
5. `data-testid="mutation-builder"`
6. `data-testid="query-editor"`
7. `data-testid="variables-editor"`
8. `data-testid="execute-query-button"`
9. `data-testid="execute-mutation-button"`
10. `data-testid="response-viewer"`
11. `data-testid="field-selection"`
12. `data-testid="type-browser"`
13. `data-testid="auto-start-prompt-graphql"`
14. `data-testid="graphql-service-url"`

## Test Scenarios

### 1. Open GraphQL Try It (Description: Click Try Service on GraphQL service)

**Steps:**
1. Navigate to BI extension view
2. Open a GraphQL Service in the Service Designer view
3. Verify "Try Service" button is visible
4. Click on "Try Service" button
5. Verify GraphQL Try It functionality is triggered
6. **Verify the source generated:**
    - Verify GraphQL service is correctly defined in source
    - Verify service URL is correctly determined
7. **Verify the diagram:**
    - Verify service is correctly represented in diagram

---

### 2. Verify GraphQL client opens (Description: GraphQL explorer view opens)

**Steps:**
1. Click "Try Service" button on GraphQL service
2. Verify GraphQL explorer webview panel opens
3. Verify panel title shows "Graphql Try It" or similar
4. Verify GraphQL explorer interface is displayed
5. Verify service URL is displayed (e.g., `http://localhost:9090/graphql`)
6. Verify schema explorer is visible
7. Verify query builder is visible
8. Verify response viewer is visible
9. **Verify the source generated:**
    - Verify GraphQL explorer is correctly initialized
    - Verify service URL is correctly determined from source
10. **Verify the diagram:**
    - Verify GraphQL explorer opens correctly for service in diagram

---

### 3. View schema explorer (Description: See schema types and fields)

**Steps:**
1. Open GraphQL Try It explorer
2. Verify Schema Explorer section is visible
3. Verify GraphQL types are listed (Query, Mutation, custom types)
4. Click on a type (e.g., "Query")
5. Verify fields for that type are displayed
6. Verify field names are shown
7. Verify field types are shown
8. Verify field arguments are shown (if applicable)
9. Navigate through different types
10. Verify schema structure is correctly displayed
11. **Verify the source generated:**
    - Verify schema explorer reflects GraphQL schema from source
    - Verify types and fields match source definition
12. **Verify the diagram:**
    - Verify schema matches GraphQL service definition in diagram

---

### 4. Build query from explorer (Description: Click fields to build query)

**Steps:**
1. Open GraphQL Try It explorer
2. Verify Schema Explorer is visible
3. Click on "Query" type in schema explorer
4. Verify Query fields are displayed
5. Click on a field (e.g., "getUser")
6. Verify field is added to query builder
7. Verify query editor shows the selected field
8. Click on nested fields (if applicable)
9. Verify nested fields are added to query
10. Verify query structure is built correctly
11. Continue building query by selecting more fields
12. Verify query is properly formatted
13. **Verify the source generated:**
    - Verify query builder reflects GraphQL schema from source
    - Verify field selection matches available fields
14. **Verify the diagram:**
    - Verify query building works correctly with service definition

---

### 5. Execute query (Description: Run GraphQL query)

**Steps:**
1. Open GraphQL Try It explorer
2. Build a query using query builder or type directly in query editor
3. Verify query is correctly formatted
4. Add query variables if needed (in variables editor)
5. Ensure service is running
6. Click "Execute Query" button (or use keyboard shortcut)
7. Verify request is sent to GraphQL service
8. Verify loading indicator appears (if applicable)
9. Verify response is received
10. Verify response is displayed in response viewer
11. Verify response format is correct (JSON)
12. **Verify the source generated:**
    - Verify query is correctly sent to service
    - Verify query matches GraphQL service schema
13. **Verify the diagram:**
    - Verify query execution works correctly with service

---

### 6. View query response (Description: See query results)

**Steps:**
1. Execute a GraphQL query
2. Verify response is displayed in response viewer
3. Verify response is formatted as JSON
4. Verify response is pretty-printed/formatted
5. Verify response contains expected data fields
6. Verify response structure matches query structure
7. Execute different queries
8. Verify each response is correctly displayed
9. Verify response data is correct
10. **Verify the source generated:**
    - Verify response matches GraphQL service response
    - Verify response structure is correct
11. **Verify the diagram:**
    - Verify response reflects service resolver implementation

---

### 7. Execute mutation (Description: Run GraphQL mutation)

**Steps:**
1. Open GraphQL Try It explorer
2. Navigate to Mutation type in schema explorer
3. Select a mutation field (e.g., "createUser")
4. Verify mutation is added to mutation builder
5. Verify mutation editor shows the selected mutation
6. Fill in mutation arguments
7. Add mutation variables if needed
8. Ensure service is running
9. Click "Execute Mutation" button
10. Verify request is sent to GraphQL service
11. Verify response is received
12. Verify mutation response is displayed
13. **Verify the source generated:**
    - Verify mutation is correctly sent to service
    - Verify mutation arguments match schema
14. **Verify the diagram:**
    - Verify mutation execution works correctly with service

---

### 8. Auto start service prompt (Description: Prompt to start if not running)

**Steps:**
1. Ensure GraphQL service is not running
2. Click "Try Service" button on GraphQL service
3. Verify prompt appears: "The 'Try It' feature requires a running Ballerina service. Would you like to run the integration first?"
4. Verify "Run Integration" button is displayed
5. Verify "Cancel" button is displayed
6. Click "Run Integration" button
7. Verify integration starts running
8. Verify GraphQL explorer opens after service starts
9. Verify GraphQL explorer connects to running service
10. Click "Cancel" button (in another test)
11. Verify prompt is dismissed
12. Verify GraphQL explorer is not opened when cancelled
13. **Verify the source generated:**
    - Verify service starts correctly when "Run Integration" is clicked
    - Verify GraphQL explorer opens after service starts
14. **Verify the diagram:**
    - Verify service running state is reflected in diagram

---

## Notes

- The GraphQL Try It feature opens a webview panel with a GraphQL explorer interface
- The explorer uses the GraphQL service endpoint (e.g., `http://localhost:9090/graphql`)
- Schema introspection is used to discover available types and fields
- Queries and mutations can be built interactively or typed directly
- Query variables can be provided in JSON format
- Responses are displayed as formatted JSON
- The service must be running for Try It to work (prompt appears if not running)
- The GraphQL explorer provides an interactive interface similar to GraphQL Playground or GraphiQL
- Multiple GraphQL services can exist in a project, and the explorer opens for the selected service

