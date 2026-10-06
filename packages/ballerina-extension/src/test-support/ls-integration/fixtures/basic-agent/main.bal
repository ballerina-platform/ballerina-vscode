import ballerina/ai;
import ballerina/http;

listener ai:Listener greeterListener = new (listenOn = check http:getDefaultListener());

service /greeter on greeterListener {
    resource function post chat(@http:Payload ai:ChatReqMessage request) returns ai:ChatRespMessage|error {
        string stringResult = check greeterAgent.run(request.message, request.sessionId);
        return {message: stringResult};
    }
}
