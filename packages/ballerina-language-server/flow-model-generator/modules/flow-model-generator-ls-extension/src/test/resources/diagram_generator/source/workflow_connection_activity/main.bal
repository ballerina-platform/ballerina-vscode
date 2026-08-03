import ballerina/workflow;

public client class OrderClient {
    remote function fetch(int id) returns int|error {
        return id;
    }
}

final OrderClient orderClient = new;

type OrderInput record {|
    readonly string orderId;
|};

# Fetch order details as a workflow activity.
@workflow:Activity
function fetchOrder(OrderClient connection, int id) returns int|error {
    return connection->fetch(id);
}

# Order workflow that calls a connection-backed activity.
@workflow:Workflow
function orderWorkflow(workflow:Context ctx, OrderInput input) returns error? {
    int orderData = check ctx->callActivity(fetchOrder, {connection: orderClient, id: 1});
}
