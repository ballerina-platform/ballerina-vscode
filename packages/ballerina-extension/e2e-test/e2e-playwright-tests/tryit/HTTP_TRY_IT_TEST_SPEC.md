# HTTP Try It - Test Specification

## Application Overview

The HTTP Try It feature in WSO2 Integrator: BI allows users to test HTTP services directly from the service designer view. When users click the "Try It" button on an HTTP service, a `tryit.http` file is generated and opened in VS Code, containing pre-configured HTTP requests for all resources in the service. Users can send GET, POST, and other HTTP requests, configure path parameters, query parameters, headers, and request bodies, and view response status, body, and headers. If the service is not running, a prompt appears to start the integration first.

## UI Elements Identified

### Buttons and Actions
- **Try It** button (text: "Try It", icon: 🧪) - in HTTP Service Designer view, "Try Service" section
- **Try It** option - in resource context menu (when clicking on a specific resource)
- **Run Integration** button - in auto-start service prompt
- **Cancel** button - in auto-start service prompt

### Try It File Elements
- **tryit.http** file - generated HTTP file with request templates
- **Request comments** - documentation for each request with parameter descriptions
- **HTTP request lines** - GET, POST, PUT, DELETE, etc. with URLs
- **Path parameter placeholders** - `{paramName}` in URLs
- **Query parameter placeholders** - `?param=value` in URLs
- **Header lines** - `HeaderName: value` format
- **Request body** - JSON, XML, or other content types
- **Send Request** action - execute HTTP request (via REST Client extension)

### Response Elements
- **Response status code** - HTTP status (200, 404, etc.)
- **Response body** - response payload content
- **Response headers** - HTTP response headers

### Service Selection
- **Quick pick menu** - appears when multiple services exist in project
- **Service list** - shows available HTTP services to select from

## Missing Test IDs Recommendations

The following test IDs should be added for better testability:

1. `data-testid="try-it-button"`
2. `data-testid="try-it-resource-menu"`
3. `data-testid="tryit-http-file"`
4. `data-testid="http-request-line"`
5. `data-testid="path-parameter-placeholder"`
6. `data-testid="query-parameter-placeholder"`
7. `data-testid="request-header-line"`
8. `data-testid="request-body"`
9. `data-testid="response-status"`
10. `data-testid="response-body"`
11. `data-testid="response-headers"`
12. `data-testid="service-quick-pick"`
13. `data-testid="auto-start-prompt"`
14. `data-testid="run-integration-button"`

## Test Scenarios

### 1. Open Try It from service menu (Description: Click Try Service button on HTTP service)

**Steps:**
1. Navigate to BI extension view
2. Open an HTTP Service in the Service Designer view
3. Verify "Try Service" section is visible
4. Verify "Try It" button is displayed in the "Try Service" section
5. Click on "Try It" button
6. Verify Try It functionality is triggered
7. **Verify the source generated:**
    - Verify tryit.http file is generated in `.ballerina` directory
    - Verify file contains service requests
8. **Verify the diagram:**
    - Verify service is correctly represented in diagram

---

### 2. Verify Tryit opening (Description: Check tryit.http file opens)

**Steps:**
1. Click "Try It" button on HTTP service
2. Verify tryit.http file is generated
3. Verify tryit.http file opens in VS Code editor
4. Verify file is opened in split view (if applicable)
5. Verify file contains HTTP request templates
6. Verify file contains comments with service information
7. Verify file contains base URL (e.g., `http://localhost:9090/`)
8. **Verify the source generated:**
    - Verify tryit.http file content is correctly generated
    - Verify file syntax is valid
9. **Verify the diagram:**
    - Verify file generation doesn't affect diagram

---

### 3. Service selection with multiple (Description: Quick pick appears for multiple services)

**Steps:**
1. Create multiple HTTP services in the project
2. Click "Try It" button on any HTTP service (or use command palette)
3. Verify quick pick menu appears
4. Verify all HTTP services are listed in quick pick
5. Verify each service shows service name and base path
6. Select a service from quick pick
7. Verify tryit.http file is generated for selected service
8. Verify tryit.http file opens
9. **Verify the source generated:**
    - Verify tryit.http file is generated for correct service
    - Verify file contains requests for selected service only
10. **Verify the diagram:**
    - Verify service selection works correctly

---

### 4. Test GET request (Description: Send GET request and see response)

**Steps:**
1. Open tryit.http file
2. Verify GET request template is present
3. Verify GET request URL is correctly formatted (e.g., `GET http://localhost:9090/path`)
4. Ensure service is running (start if needed)
5. Click "Send Request" (or use REST Client extension shortcut)
6. Verify request is sent to service
7. Verify response is received
8. Verify response status code is displayed (e.g., 200 OK)
9. Verify response body is displayed
10. Verify response headers are displayed
11. **Verify the source generated:**
    - Verify GET request is correctly formatted in tryit.http
    - Verify request matches service resource definition
12. **Verify the diagram:**
    - Verify GET request corresponds to correct resource in diagram

---

### 5. Test POST request (Description: Send POST with body and see response)

**Steps:**
1. Open tryit.http file
2. Verify POST request template is present
3. Verify POST request URL is correctly formatted
4. Verify request body template is present
5. Fill in request body with JSON/XML data
6. Ensure service is running
7. Click "Send Request" for POST request
8. Verify request is sent with body
9. Verify response is received
10. Verify response status code is displayed
11. Verify response body is displayed
12. Verify request body was correctly sent
13. **Verify the source generated:**
    - Verify POST request is correctly formatted in tryit.http
    - Verify request body template is correct
    - Verify Content-Type header is set
14. **Verify the diagram:**
    - Verify POST request corresponds to correct resource in diagram

---

### 6. Request with path params (Description: Replace path parameter values)

**Steps:**
1. Open tryit.http file for service with path parameters
2. Verify path parameter placeholders are present (e.g., `{id}`)
3. Verify comments describe path parameters
4. Replace path parameter placeholder with actual value (e.g., `{id}` → `123`)
5. Ensure service is running
6. Send the request
7. Verify request URL includes the path parameter value
8. Verify response is received
9. Verify path parameter was correctly passed to service
10. **Verify the source generated:**
    - Verify path parameters are correctly documented in tryit.http
    - Verify path parameter placeholders are correctly formatted
11. **Verify the diagram:**
    - Verify path parameters match resource definition in diagram

---

### 7. Request with query params (Description: Add query parameters)

**Steps:**
1. Open tryit.http file
2. Verify query parameter placeholders are present (e.g., `?param=value`)
3. Verify comments describe query parameters
4. Add or modify query parameters in URL
5. Ensure service is running
6. Send the request
7. Verify request URL includes query parameters
8. Verify response is received
9. Verify query parameters were correctly passed to service
10. **Verify the source generated:**
    - Verify query parameters are correctly documented in tryit.http
    - Verify query parameter format is correct
11. **Verify the diagram:**
    - Verify query parameters match resource definition in diagram

---

### 8. Request with headers (Description: Add custom headers)

**Steps:**
1. Open tryit.http file
2. Verify header placeholders are present (if applicable)
3. Add custom headers to request (e.g., `Authorization: Bearer token`)
4. Ensure service is running
5. Send the request
6. Verify request includes custom headers
7. Verify response is received
8. Verify headers were correctly sent to service
9. **Verify the source generated:**
    - Verify headers are correctly formatted in tryit.http
    - Verify header syntax is correct
10. **Verify the diagram:**
    - Verify headers work correctly with service

---

### 9. Request with JSON body (Description: Set JSON request body)

**Steps:**
1. Open tryit.http file for POST/PUT request
2. Verify request body section is present
3. Verify Content-Type header is set to `application/json`
4. Fill in JSON request body
5. Verify JSON syntax is valid
6. Ensure service is running
7. Send the request
8. Verify request body is sent as JSON
9. Verify response is received
10. Verify JSON body was correctly parsed by service
11. **Verify the source generated:**
    - Verify JSON body template is correctly formatted in tryit.http
    - Verify Content-Type header is set
12. **Verify the diagram:**
    - Verify JSON body matches resource definition in diagram

---

### 10. View response status (Description: See HTTP status code)

**Steps:**
1. Open tryit.http file
2. Send an HTTP request
3. Verify response status code is displayed
4. Verify status code format (e.g., `200 OK`, `404 Not Found`)
5. Verify status code is highlighted/colored appropriately
6. Send multiple requests with different status codes
7. Verify each response shows correct status code
8. **Verify the source generated:**
    - Verify response status is correctly displayed
    - Verify status code matches service response
9. **Verify the diagram:**
    - Verify response status reflects service behavior

---

### 11. View response body (Description: See response payload)

**Steps:**
1. Open tryit.http file
2. Send an HTTP request
3. Verify response body is displayed
4. Verify response body format (JSON, XML, text, etc.)
5. Verify response body is formatted/pretty-printed (if applicable)
6. Verify response body content matches service response
7. Send requests to different resources
8. Verify each response body is correctly displayed
9. **Verify the source generated:**
    - Verify response body is correctly displayed
    - Verify response body matches service response
10. **Verify the diagram:**
    - Verify response body reflects service resource return type

---

### 12. View response headers (Description: See response headers)

**Steps:**
1. Open tryit.http file
2. Send an HTTP request
3. Verify response headers are displayed
4. Verify common headers are shown (Content-Type, Content-Length, etc.)
5. Verify custom headers from service are displayed
6. Verify header format is correct
7. Send multiple requests
8. Verify response headers for each request
9. **Verify the source generated:**
    - Verify response headers are correctly displayed
    - Verify headers match service response
10. **Verify the diagram:**
    - Verify response headers reflect service configuration

---

### 13. Auto start service prompt (Description: Prompt to start if not running)

**Steps:**
1. Ensure service is not running
2. Click "Try It" button on HTTP service
3. Verify prompt appears: "The 'Try It' feature requires a running Ballerina service. Would you like to run the integration first?"
4. Verify "Run Integration" button is displayed
5. Verify "Cancel" button is displayed
6. Click "Run Integration" button
7. Verify integration starts running
8. Verify tryit.http file is generated and opened after service starts
9. Click "Cancel" button (in another test)
10. Verify prompt is dismissed
11. Verify tryit.http file is not generated when cancelled
12. **Verify the source generated:**
    - Verify service starts correctly when "Run Integration" is clicked
    - Verify tryit.http file is generated after service starts
13. **Verify the diagram:**
    - Verify service running state is reflected in diagram

---

### 14. Try It from resource menu (Description: Click Try It on specific resource)

**Steps:**
1. Navigate to HTTP Service Designer view
2. Verify resources are listed
3. Right-click on a specific resource (or use resource menu)
4. Verify "Try It" option is available in context menu
5. Click "Try It" option
6. Verify tryit.http file is generated
7. Verify tryit.http file opens
8. Verify tryit.http file contains request for the selected resource
9. Verify request is pre-configured with resource path and method
10. **Verify the source generated:**
    - Verify tryit.http file contains request for selected resource
    - Verify resource-specific request is correctly formatted
11. **Verify the diagram:**
    - Verify resource selection works correctly in diagram context

---

## Notes

- The Try It feature uses the REST Client extension (or similar) to execute HTTP requests
- tryit.http files are generated in the `.ballerina` directory of the project
- The file format follows HTTPYAC/REST Client syntax
- Path parameters, query parameters, and headers are automatically extracted from service definitions
- Request bodies are generated based on resource parameter types
- The service must be running for Try It to work (prompt appears if not running)
- Multiple services trigger a quick pick menu for service selection
- tryit.http files can be manually edited and saved for custom requests

