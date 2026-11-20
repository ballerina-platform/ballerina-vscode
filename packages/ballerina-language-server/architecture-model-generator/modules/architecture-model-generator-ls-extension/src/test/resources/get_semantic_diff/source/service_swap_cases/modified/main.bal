import ballerina/http;
import ballerina/tcp;

listener tcp:Listener tcpListener = new (3000);

listener http:Listener httpListener = new (9090);

service on httpListener {
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
