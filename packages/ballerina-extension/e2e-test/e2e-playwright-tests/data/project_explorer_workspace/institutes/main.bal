import ballerinax/rabbitmq;

listener rabbitmq:Listener rabbitmqListener = new ("localhost", 5672);

service "myQueue" on rabbitmqListener {
    remote function onMessage(RabbitMQAnydataMessage message, rabbitmq:Caller caller) returns error? {
        do {
        } on fail error err {
            // handle error
            return error("unhandled error", err);
        }
    }

}
