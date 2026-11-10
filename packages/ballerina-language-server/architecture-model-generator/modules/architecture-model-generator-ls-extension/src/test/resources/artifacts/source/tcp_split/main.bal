import ballerina/tcp;

listener tcp:Listener tcpListener = new (3000);

service on tcpListener {
    remote function onConnect(tcp:Caller caller) returns tcp:ConnectionService|tcp:Error {
        return new EchoService();
    }
}
