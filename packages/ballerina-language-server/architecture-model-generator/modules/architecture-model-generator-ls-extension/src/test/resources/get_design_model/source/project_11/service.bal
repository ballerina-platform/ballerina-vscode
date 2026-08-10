import ballerina/mcp;

listener mcp:Listener mcpListener = new (8080);

service mcp:Service /mcp on mcpListener {
}
