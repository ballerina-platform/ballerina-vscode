import ballerina/http;
import ballerina/tcp;

listener tcp:Listener tcpListener = new (3000);

listener http:Listener httpListener = new (9090);

service on tcpListener {
    remote function onConnect(tcp:Caller caller) returns tcp:ConnectionService {
        return new EchoService();
    }
}

service class EchoService {
    *tcp:ConnectionService;

    remote function onBytes(readonly & byte[] data) returns byte[] {
        return data;
    }
}
