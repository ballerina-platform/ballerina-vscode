import ballerina/workflow;

@workflow:Workflow
function approve(workflow:Context ctx, string request) returns string|error {
    return request;
}
