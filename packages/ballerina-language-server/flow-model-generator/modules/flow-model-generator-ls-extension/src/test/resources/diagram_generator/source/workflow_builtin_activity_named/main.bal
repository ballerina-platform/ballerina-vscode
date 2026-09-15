import ballerina/http;
import ballerina/workflow;
import ballerina/workflow.activity;

final http:Client ordersApi = check new ("http://localhost:9090");

# Calls the REST builtin activity positionally and by name; both must hydrate the same form.
@workflow:Workflow
function fetchOrders(workflow:Context ctx) returns error? {
    json byPosition = check ctx->callActivity(activity:callRestAPI, {connection: ordersApi, method: "GET", path: "/orders"});
    json byName = check ctx->callActivity(activityFunction = activity:callRestAPI, args = {connection: ordersApi, method: "GET", path: "/orders"});
}
