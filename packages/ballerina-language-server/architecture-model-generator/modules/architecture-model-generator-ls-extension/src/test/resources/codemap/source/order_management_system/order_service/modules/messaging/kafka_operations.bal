import ballerina/lang.value as value;
import ballerina/log;

public function publishOrderEvent(OrderCreatedEvent eventPayload) returns error? {
    string eventString = value:toJsonString(value:toJson(eventPayload));

    check kafkaProducer->send({
        topic: orderEventsTopic,
        key: eventPayload.data.orderId,
        value: eventString.toBytes()
    });
    check kafkaProducer->'flush();
    log:printInfo("Published OrderCreated event to Kafka", orderId = eventPayload.data.orderId);
}
