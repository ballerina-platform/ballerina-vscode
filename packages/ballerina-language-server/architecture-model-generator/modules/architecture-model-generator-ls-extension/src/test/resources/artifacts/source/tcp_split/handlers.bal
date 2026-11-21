import ballerina/tcp;

service class EchoService {
    *tcp:ConnectionService;

    remote function onBytes(tcp:Caller caller, readonly & byte[] data) returns tcp:Error? {
        check caller->writeBytes(data);
    }

    remote function onError(tcp:Error tcpError) returns tcp:Error? {
        return tcpError;
    }
}
