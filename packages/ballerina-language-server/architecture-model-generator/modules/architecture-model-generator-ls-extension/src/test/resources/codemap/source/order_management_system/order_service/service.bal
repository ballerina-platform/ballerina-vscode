import ballerina/http;
import ballerina/log;

import wso2/order_service.db;

public type OrderCreationResponse record {|
    string orderId;
    string status = "PENDING";
    string message = "Order received and is being processed.";
|};

@http:ServiceConfig {
    cors: {
        allowOrigins: ["https://grc.com"],
        allowMethods: ["GET", "POST"]
    }
}
service /v1 on new http:Listener(SERVICE_PORT) {

    resource function post orders(@http:Payload OrderCreatePayload payload) returns OrderCreationResponse|http:InternalServerError|http:BadRequest {
        if payload.orderLines.length() == 0 {
            log:printWarn("Create order attempt with no order lines", customerId = payload.customerId);
            return <http:BadRequest>{body: {message: "Order must contain at least one line item."}};
        }

        var result = createNewOrder(payload);

        if result is OrderCreationResponse {
            log:printInfo("Order creation process initiated", orderId = result.orderId);
            return result;
        } else {
            log:printError("Failed to initiate order creation", result);
            return <http:InternalServerError>{body: {message: "An internal error occurred while creating the order."}};
        }
    }

    resource function get orders/[string orderId]() returns Order|http:NotFound|http:InternalServerError {
        var result = getOrderById(orderId);

        if result is Order {
            return result;
        } else if result is db:OrderNotFoundError {
            log:printWarn("Order not found", orderId = orderId);
            return <http:NotFound>{body: {message: string `Order with ID ${orderId} not found.`}};
        } else {
            log:printError("Unexpected error fetching order", result, orderId = orderId);
            return <http:InternalServerError>{body: {message: "An internal error occurred."}};
        }
    }
}
