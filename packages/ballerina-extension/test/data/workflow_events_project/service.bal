import ballerina/http;
import ballerina/workflow;

listener http:Listener httpDefaultListener = http:getDefaultListener();

service /orders on httpDefaultListener {

    resource function post submit(OrderInput input) returns string|error {
        return check workflow:run(orderWorkflow, input);
    }

    resource function post payment(string workflowId, PaymentData payment) returns error? {
        check workflow:sendData(orderWorkflow, workflowId, "paymentReceived", payment);
    }
}
