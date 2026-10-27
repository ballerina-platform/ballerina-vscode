import ballerina/http;
import ballerina/tcp;

service /orders on httpListener {
    resource function post .() returns string {
        return "accepted";
    }
}

service on tcpListener {
    remote function onConnect(tcp:Caller caller) returns tcp:ConnectionService {
        return new EchoService();
    }

    remote function onError(tcp:Error err) {
        string message = err.message();
    }
}

service on new http:Listener(8080) {
    resource function get health() returns string {
        return "ok";
    }

    resource function get ready() returns string {
        return "ready";
    }
}

service http:Service /payments on new http:Listener(8081) {
    resource function post refunds() returns string {
        return "refunded";
    }
}

service class EchoService {
    *tcp:ConnectionService;

    remote function onBytes(readonly & byte[] data) returns byte[] {
        return data;
    }
}
