import ballerina/tcp;

service tcp:Service on new tcp:Listener(3011) {
    remote function onConnect(tcp:Caller caller) returns tcp:ConnectionService|tcp:Error? {
        return new InlineService();
    }
}

service class InlineService {
    *tcp:ConnectionService;

    remote function onClose() returns tcp:Error? {
    }
}
