import ballerina/tcp;

listener tcp:Listener tcpListener = new (3000);

service on tcpListener {
    remote function onConnect(tcp:Caller caller) returns tcp:ConnectionService|tcp:Error {
        return new EchoService();
    }
}

service class EchoService {
    *tcp:ConnectionService;

    remote function onBytes(tcp:Caller caller, readonly & byte[] data) returns tcp:Error? {
        check caller->writeBytes(data);
    }
}

service class Greeter {
    remote function greet() returns string {
        return "hello";
    }
}

type Message record {|
    string text;
|};
