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

service on queueListener {
    remote function onMessage(string payload) {
        string received = payload;
    }

    remote function onRetry(string payload) {
    }

    function format(string payload) returns string {
        return payload;
    }
}
