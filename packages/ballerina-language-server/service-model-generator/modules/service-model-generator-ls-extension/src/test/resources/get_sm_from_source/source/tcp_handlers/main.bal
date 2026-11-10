import ballerina/tcp;

listener tcp:Listener bufferingListener = new (3010);

service tcp:Service on bufferingListener {
    remote function onConnect(tcp:Caller caller) returns tcp:ConnectionService|tcp:Error? {
        return new BufferingService();
    }
}

service class BufferingService {
    *tcp:ConnectionService;

    byte[] buffer = [];

    remote function onBytes(tcp:Caller caller, readonly & byte[] data) returns tcp:Error? {
        self.buffer.push(...data);
    }
}
