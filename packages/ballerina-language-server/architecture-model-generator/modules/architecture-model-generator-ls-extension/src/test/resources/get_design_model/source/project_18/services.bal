import ballerina/http;

// Offloads to replyToMessage via `start` -- the shape every generated channel trigger uses.
service /asyncService on new http:Listener(8080) {
    resource function post webhook(@http:Payload string query) returns error? {
        _ = start replyToMessage(query);
    }
}

// Calls the agent directly -- the already-proven synchronous path, kept as a contrast.
service /directService on new http:Listener(8081) {
    resource function post chat(@http:Payload string query) returns string|error {
        return chatAgent.run(query);
    }
}

// Never reaches the agent -- negative control.
service /healthService on new http:Listener(8082) {
    resource function get status() returns string {
        return "ok";
    }
}
