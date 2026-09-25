import ballerina/http;
import ballerina/workflow;
import ballerina/workflow.activity;

final http:Client httpClient = check new ("http://localhost:9090");

// Module-level values a user may reuse across workflows.
final readonly & workflow:AutoRetry STANDARD_RETRY = {maxRetries: 5, retryDelay: 2.0, retryBackoff: 3.0};
final readonly & string[] APPROVERS = ["FINANCE_APPROVER", "MANAGER"];
const string GET_METHOD = "GET";
final readonly & workflow:ReviewTaskDefinition FINANCE_GATE = {userRoles: "finance"};

type OrderInput record {|
    readonly string orderId;
|};

@workflow:Activity
function fetchOrder(int id) returns int|error => id;

@workflow:Workflow
function varRefWorkflow(workflow:Context ctx, OrderInput input) returns error? {
    // 1. retryPolicy as a module-level record reference
    int a = check ctx->callActivity(fetchOrder, {id: 1}, retryPolicy = STANDARD_RETRY);

    // 2. approvalPolicy as a module-level record reference
    int b = check ctx->callActivity(fetchOrder, {id: 2}, approvalPolicy = FINANCE_GATE);

    // 3. REST builtin with the HTTP method coming from a constant
    json c = check ctx->callActivity(activity:callRestAPI,
            {connection: httpClient, method: GET_METHOD, path: "/users/1"});

    // 4. Human task with the roles coming from a module-level array reference
    boolean d = check ctx->awaitHumanTask("approve", userRoles = APPROVERS);
}
