import ballerina/http;
import ballerina/mcp;

http:Client apiClient = check new ("http://localhost:9090");
listener mcp:StreamableHttpListener mcpListener = check new (9090);

@mcp:StreamableHttpServiceConfig {
    info: {
        name: "Existing Service",
        version: "1.0.0"
    }
}
service mcp:StreamableHttpService /existing on mcpListener {
}
