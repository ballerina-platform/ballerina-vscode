import ballerina/http;
import ballerina/workflow;
import ballerina/workflow.activity;

final http:Client ordersApi = check new ("http://localhost:9090");

# Calls the REST builtin activity without a path argument; the omitted optional argument must
# reopen the field in text mode, the same mode a fresh node template opens in.
@workflow:Workflow
function fetchOrders(workflow:Context ctx) returns error? {
    json allOrders = check ctx->callActivity(activity:callRestAPI, {connection: ordersApi, method: "GET"});
}
