import ballerinax/kafka;

public final kafka:Producer kafkaProducer = check new (
    bootstrapServers = [brokerUrl]
);

public function closeProducer() returns error? {
    return kafkaProducer->close();
}
