import ballerina/lang.value as value;
import ballerina/log;
import ballerina/sql;

import wso2/order_service.db;
import wso2/order_service.messaging;
import wso2/order_utils;

public function createNewOrder(OrderCreatePayload payload) returns OrderCreationResponse|error {
    string orderId = order_utils:generateId();
    decimal totalAmount = calculateTotal(payload.orderLines);

    decimal mockUnitPrice = 99.99;
    OrderLine[] linesWithPrices = from var line in payload.orderLines
        select {
            lineId: order_utils:generateId(),
            sku: line.sku,
            quantity: line.quantity,
            unitPrice: mockUnitPrice,
            lineTotal: order_utils:calculateLineTotal(mockUnitPrice, line.quantity)
        };

    db:OrderInsertRecord dbRecord = {
        orderId: orderId,
        customerId: payload.customerId,
        status: "PENDING",
        createdAt: order_utils:getCurrentTimestamp(),
        totalAmount: totalAmount,
        currency: payload.currency,
        shippingAddress: value:toJsonString(value:toJson(payload.shippingAddress)),
        billingAddress: value:toJsonString(value:toJson(payload.billingAddress)),
        orderLines: value:toJsonString(value:toJson(linesWithPrices))
    };

    sql:ExecutionResult|sql:Error dbResult = db:insertOrder(dbRecord);
    if dbResult is sql:Error {
        log:printError("Database error on initial order insert", dbResult);
        return dbResult;
    }

    messaging:OrderCreatedEvent event = {
        eventId: order_utils:generateId(),
        timestamp: order_utils:getCurrentTimestamp(),
        data: {
            orderId: orderId,
            customerId: payload.customerId,
            currency: payload.currency,
            totalAmount: totalAmount,
            orderLines: from var line in payload.orderLines
                select {sku: line.sku, quantity: line.quantity},
            paymentInfo: {
                paymentMethodToken: payload.paymentInfo.paymentMethodToken,
                amount: payload.paymentInfo.amount
            }
        }
    };

    error? kafkaResult = messaging:publishOrderEvent(event);
    if kafkaResult is error {
        log:printError("Kafka publish error", kafkaResult);
        return kafkaResult;
    }

    return {orderId: orderId};
}

public function getOrderById(string orderId) returns Order|db:OrderNotFoundError|error {
    db:OrderDbRow|db:OrderNotFoundError|error dbResult = db:getOrderById(orderId);

    if dbResult is error {
        return dbResult;
    }

    db:OrderDbRow row = dbResult;
    Address shippingAddress = check row.shippingAddress.cloneWithType(Address);
    Address billingAddress = check row.billingAddress.cloneWithType(Address);
    OrderLine[] orderLines = check row.orderLines.cloneWithType();
    OrderStatus orderStatus = check value:ensureType(row.status, OrderStatus);

    return {
        orderId: row.orderId,
        customerId: row.customerId,
        status: orderStatus,
        createdAt: row.createdAt,
        totalAmount: row.totalAmount,
        currency: row.currency,
        shippingAddress: shippingAddress,
        billingAddress: billingAddress,
        orderLines: orderLines,
        payments: [],
        shipments: []
    };
}

function calculateTotal(OrderLinePayload[] lines) returns decimal {
    decimal mockUnitPrice = 99.99;
    return lines.reduce(function(decimal acc, OrderLinePayload line) returns decimal {
        return acc + order_utils:calculateLineTotal(mockUnitPrice, line.quantity);
    }, 0.0d);
}
