import ballerina/mcp;

listener mcp:Listener mcpListener = check new (9090);

@mcp:ServiceConfig {
    info: {
        name: "bookstore",
        version: "1.0.0"
    }
}
service mcp:Service /mcp on mcpListener {

    @mcp:Tool {
        description: "Delete a book from the bookstore by its ID"
    }
    remote function deleteBook(int bookId) returns string|error {
        return "ok";
    }

    @mcp:Tool {
        description: "List books filtered by author",
        schema: {
            "type": "object",
            "properties": {
                "author": {"type": "string"}
            }
        }
    }
    remote function listBooks(string author) returns string {
        return "ok";
    }
}
