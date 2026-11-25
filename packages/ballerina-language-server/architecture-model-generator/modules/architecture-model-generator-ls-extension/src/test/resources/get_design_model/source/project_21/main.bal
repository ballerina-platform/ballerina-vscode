import ballerina/http;
import ballerina/tcp;

final http:Client backendClient = check new ("http://localhost:9090");

listener tcp:Listener tcpListener = new (9000);

service tcp:Service on tcpListener {
    remote function onConnect(tcp:Caller caller) returns tcp:ConnectionService|tcp:Error? {
        do {
            TcpEchoService connectionService = new TcpEchoService();
            return connectionService;
        } on fail error err {
            // handle error
            return error("unhandled error", err);
        }
    }
}

service class TcpEchoService {
    *tcp:ConnectionService;

    remote function onBytes(tcp:Caller caller, readonly & byte[] data) returns tcp:Error? {
        do {
            json _ = check backendClient->/echo.post(data);
        } on fail error err {
            // handle error
            return error("unhandled error", err);
        }
    }

    remote function onError(tcp:Error tcpError) returns tcp:Error? {
        do {

        } on fail error err {
            // handle error
            return error("unhandled error", err);
        }
    }

    remote function onClose() returns tcp:Error? {
        do {

        } on fail error err {
            // handle error
            return error("unhandled error", err);
        }
    }
}
