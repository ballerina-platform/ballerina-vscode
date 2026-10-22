# order_management_system - High Level Codebase Overview

---

## Package: order_utils
---

## File Path: order_utils/utils.bal

```ballerina
import ballerina/uuid [L:1 - L:1]
import ballerina/time [L:2 - L:2]
```

```ballerina
# Generates a new random UUID v4 string.
# + return - UUID string
public function generateId() returns string [L:4 - L:9]
# Returns the current UTC time as an ISO 8601 string.
# + return - timestamp string
public function getCurrentTimestamp() returns string [L:11 - L:16]
# Calculates the total price for a line item.
# + unitPrice - price per unit
# + quantity  - number of units
# + return    - line total
public function calculateLineTotal(decimal unitPrice, int quantity) returns decimal [L:18 - L:25]
```

---

## Package: order_service
---

## File Path: order_service/configurations.bal

```ballerina
configurable int SERVICE_PORT [L:1 - L:1]
```

---

## File Path: order_service/functions.bal

```ballerina
import ballerina/lang.value as value [L:1 - L:1]
import ballerina/log [L:2 - L:2]
import ballerina/sql [L:3 - L:3]
import wso2/order_service.db [L:5 - L:5]
import wso2/order_service.messaging [L:6 - L:6]
import wso2/order_utils [L:7 - L:7]
```

```ballerina
public function createNewOrder(OrderCreatePayload payload) returns OrderCreationResponse|error [L:9 - L:65]
public function getOrderById(string orderId) returns Order|db:OrderNotFoundError|error [L:67 - L:93]
function calculateTotal(OrderLinePayload[] lines) returns decimal [L:95 - L:100]
```

---

## File Path: order_service/main.bal

```ballerina
import wso2/order_service.db [L:1 - L:1]
import wso2/order_service.messaging [L:2 - L:2]
import ballerina/log [L:3 - L:3]
import ballerina/lang.runtime as runtime [L:4 - L:4]
```

```ballerina
public function main() [L:6 - L:15]
```

---

## File Path: order_service/service.bal

```ballerina
import ballerina/http [L:1 - L:1]
import ballerina/log [L:2 - L:2]
import wso2/order_service.db [L:4 - L:4]
```

```ballerina
public type OrderCreationResponse record [L:6 - L:10]
```

```ballerina
@http:ServiceConfig {cors: {
        allowOrigins: ["https://grc.com"],
        allowMethods: ["GET", "POST"]
    }}
service /v1 on new http:Listener(SERVICE_PORT) { [L:12 - L:50]
    resource function post orders(@http:Payload OrderCreatePayload payload) returns OrderCreationResponse|http:InternalServerError|http:BadRequest [L:20 - L:35]
    resource function get orders/[string orderId]() returns Order|http:NotFound|http:InternalServerError [L:37 - L:49]
}
```

---

## File Path: order_service/types.bal

```ballerina
public type Order record [L:1 - L:13]
public type OrderCreatePayload record [L:15 - L:22]
public type OrderLinePayload record [L:24 - L:27]
public type OrderLine record [L:29 - L:35]
public type Address record [L:37 - L:44]
public type Payment record [L:46 - L:50]
public type PaymentInfo record [L:52 - L:55]
public type Shipment record [L:57 - L:62]
public type OrderStatus "PENDING"|"CONFIRMED"|"AWAITING_PAYMENT"|"FULFILLING"|"SHIPPED"|"DELIVERED"|"CANCELLED"|"RETURNED"|"FAILED" [L:64 - L:64]
```

---

## File Path: order_service/modules/db/db_client.bal

```ballerina
import ballerinax/postgresql [L:1 - L:1]
```

```ballerina
public final postgresql:Client dbClient [L:3 - L:9]
```

```ballerina
public function closeClient() returns error? [L:11 - L:13]
```

---

## File Path: order_service/modules/db/db_config.bal

```ballerina
configurable string host [L:1 - L:1]
configurable int port [L:2 - L:2]
configurable string username [L:3 - L:3]
configurable string password [L:4 - L:4]
configurable string database [L:5 - L:5]
```

---

## File Path: order_service/modules/db/db_operations.bal

```ballerina
import ballerina/sql [L:1 - L:1]
import ballerina/log [L:2 - L:2]
```

```ballerina
public function insertOrder(OrderInsertRecord rec) returns sql:ExecutionResult|sql:Error [L:4 - L:7]
public function getOrderById(string orderId) returns OrderDbRow|OrderNotFoundError|error [L:9 - L:21]
```

---

## File Path: order_service/modules/db/db_types.bal

```ballerina
public type OrderDbRow record [L:1 - L:11]
public type OrderInsertRecord record [L:13 - L:23]
public type OrderNotFoundError distinct error [L:25 - L:25]
```

---

## File Path: order_service/modules/messaging/kafka_config.bal

```ballerina
configurable string brokerUrl [L:1 - L:1]
configurable string orderEventsTopic [L:2 - L:2]
```

---

## File Path: order_service/modules/messaging/kafka_operations.bal

```ballerina
import ballerina/lang.value as value [L:1 - L:1]
import ballerina/log [L:2 - L:2]
```

```ballerina
public function publishOrderEvent(OrderCreatedEvent eventPayload) returns error? [L:4 - L:14]
```

---

## File Path: order_service/modules/messaging/kafka_producer.bal

```ballerina
import ballerinax/kafka [L:1 - L:1]
```

```ballerina
public final kafka:Producer kafkaProducer [L:3 - L:5]
```

```ballerina
public function closeProducer() returns error? [L:7 - L:9]
```

---

## File Path: order_service/modules/messaging/kafka_types.bal

```ballerina
public type OrderCreatedEvent record [L:1 - L:6]
public type OrderCreatedEventData record [L:8 - L:15]
public type OrderLineEvent record [L:17 - L:20]
public type PaymentInfoEvent record [L:22 - L:25]
```
