import ballerina/http;
import ballerina/workflow;

listener http:Listener httpDefaultListener = http:getDefaultListener();

service /api on httpDefaultListener {

    resource function post orders(OrderInput input) returns string|error {
        return check workflow:runWithId(orderWorkflow, input.orderId, input);
    }

    resource function post support(string ticketId, string query) returns string|error {
        return check supportAgent.runWithId(ticketId, query);
    }

    resource function post chat(string query) returns string|error {
        return check supportAgent.run(query);
    }
}
