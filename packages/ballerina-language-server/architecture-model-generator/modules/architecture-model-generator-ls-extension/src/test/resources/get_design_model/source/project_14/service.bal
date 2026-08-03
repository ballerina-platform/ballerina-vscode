import ballerina/http;
import ballerina/workflow;

service /orders on new http:Listener(8090) {

    // Valid: the data name matches a declared event of the workflow
    resource function post payment(string workflowId, PaymentData payment) returns error? {
        check workflow:sendData(orderWorkflow, workflowId, "paymentReceived", payment);
    }

    // Invalid: the data name does not match any declared event (e.g. the event was renamed)
    resource function post renamed(string workflowId, PaymentData payment) returns error? {
        check workflow:sendData(orderWorkflow, workflowId, "paymentRecieved", payment);
    }

    // Invalid: the data name is not statically resolvable
    resource function post dynamic(string workflowId, string eventName) returns error? {
        check workflow:sendData(orderWorkflow, workflowId, eventName, "data");
    }
}
