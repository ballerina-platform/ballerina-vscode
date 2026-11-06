import ballerina/tcp;

listener tcp:Listener tcpInitErrorListener = new (localPort = 9001);

service tcp:Service on tcpInitErrorListener {
    remote function onConnect(tcp:Caller caller) returns tcp:ConnectionService|tcp:Error? {
        do {
            TcpGuardedService connectionService = check new TcpGuardedService(caller);
            return connectionService;
        } on fail error err {
            return error("unhandled error", err);
        }
    }
}

service class TcpGuardedService {
    *tcp:ConnectionService;
    private final tcp:Caller caller;

    function init(tcp:Caller caller) returns error? {
        self.caller = caller;
    }

    remote function onBytes(readonly & byte[] data) returns byte[]|tcp:Error? {
        return self.normalize(data);
    }

    remote function onClose() returns tcp:Error? {
    }

    function normalize(byte[] data) returns byte[] {
        return data;
    }
}
