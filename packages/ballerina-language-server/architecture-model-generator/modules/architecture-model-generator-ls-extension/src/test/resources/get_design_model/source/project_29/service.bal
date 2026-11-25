import ballerina/http;

service /pipeline on new http:Listener(9300) {
    resource function post run(@http:Payload string message) returns string|error {
        return orchestratorAgent.run(message);
    }
}
