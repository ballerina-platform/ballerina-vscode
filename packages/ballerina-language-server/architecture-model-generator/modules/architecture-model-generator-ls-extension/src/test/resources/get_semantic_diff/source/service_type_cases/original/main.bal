import ballerina/http;
import ballerina/tcp;

service /orders on httpListener {
    resource function post .() returns string {
        return "created";
    }
}

service on tcpListener {
    remote function onConnect(tcp:Caller caller) returns tcp:ConnectionService {
        return new EchoService();
    }
}

service on new http:Listener(8080) {
    resource function get health() returns string {
        return "ok";
    }
}

service class EchoService {
    *tcp:ConnectionService;

    remote function onBytes(readonly & byte[] data) returns byte[] {
        return data;
    }
}
