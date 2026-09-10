import ballerina/sql;
import ballerina/log;

public function insertOrder(OrderInsertRecord rec) returns sql:ExecutionResult|sql:Error {
    sql:ParameterizedQuery q = `INSERT INTO orders (orderId, customerId, status, createdAt, totalAmount, currency, shippingAddress, billingAddress, orderLines) VALUES (${rec.orderId}, ${rec.customerId}, ${rec.status}, ${rec.createdAt}, ${rec.totalAmount}, ${rec.currency}, ${rec.shippingAddress}, ${rec.billingAddress}, ${rec.orderLines});`;
    return dbClient->execute(q);
}

public function getOrderById(string orderId) returns OrderDbRow|OrderNotFoundError|error {
    sql:ParameterizedQuery q = `SELECT orderId, customerId, status, createdAt, totalAmount, currency, shippingAddress, billingAddress, orderLines FROM orders WHERE orderId = ${orderId};`;

    stream<OrderDbRow, sql:Error?> resultStream = dbClient->query(q);
    record {|OrderDbRow value;|}? row = check resultStream.next();
    check resultStream.close();

    if row is () {
        log:printWarn("Order not found in database", orderId = orderId);
        return error OrderNotFoundError("Order not found: " + orderId);
    }
    return row.value;
}
