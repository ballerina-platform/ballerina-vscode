import ballerina/http;

listener http:Listener httpDefaultListener = http:getDefaultListener();

service / on httpDefaultListener {

    resource function post claim(@http:Payload ExpenseClaim payload) returns json|error {
    }

    resource function post [string workflowId]/chat(@http:Payload string msg) returns json|error {
    }

    resource function get [string workflowId]/result() returns json|error {
    }
}
