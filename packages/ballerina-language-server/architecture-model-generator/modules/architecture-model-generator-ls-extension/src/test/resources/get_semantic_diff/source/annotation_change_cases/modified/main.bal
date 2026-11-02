public type QueueConfigData record {|
    string queueName;
|};

public annotation QueueConfigData QueueConfig on service;

public class QueueListener {

    public function attach(service object {} s, string[]|string? name = ()) returns error? {
    }

    public function detach(service object {} s) returns error? {
    }

    public function 'start() returns error? {
    }

    public function gracefulStop() returns error? {
    }

    public function immediateStop() returns error? {
    }
}

listener QueueListener queueListener = new;

@QueueConfig {queueName: "orders.v2"}
service on queueListener {
    remote function onMessage(string payload) {
        string received = payload.trim();
    }
}

@QueueConfig {queueName: "payments.v2"}
service on queueListener {
    remote function onMessage(string payload) {
        string received = payload;
    }
}
