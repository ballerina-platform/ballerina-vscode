import ballerina/http;
import ballerinax/kafka;

listener http:Listener httpDefaultListener = http:getDefaultListener();

service /foo on httpDefaultListener {
    resource function get bar() returns json|error {
        do {
            return "Hello World";
        } on fail error err {
            // handle error
            return error("unhandled error", err);
        }
    }

    resource function post greeting() returns json|error {
        do {
            string var1 = "Hi";
        } on fail error err {
            // handle error
            return error("unhandled error", err);
        }
    }

}

listener kafka:Listener kafkaListener = new ("localhost:9092", topics = "myTopic");

service kafka:Service on kafkaListener {
    remote function onConsumerRecord(KafkaAnydataConsumer[] messages, kafka:Caller caller) returns error? {
        do {
        } on fail error err {
            // handle error
            return error("unhandled error", err);
        }
    }

}

