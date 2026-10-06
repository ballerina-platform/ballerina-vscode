import ballerina/ai;
import ballerina/http;
import ballerinax/ai.openai;

configurable string apiKey = ?;

final ai:ModelProvider newsAgentModel = check new openai:ModelProvider(
    apiKey, openai:GPT_4O_MINI, serviceUrl = "https://openrouter.ai/api/v1");

final ai:Agent newsAgent = check new (
    systemPrompt = {role: "Hacker News Assistant", instructions: "Summarize the latest headlines."},
    model = newsAgentModel, tools = []
);

listener ai:Listener newsAgentListener = new (listenOn = check http:getDefaultListener());

service /news\-agent on newsAgentListener {
    resource function post chat(@http:Payload ai:ChatReqMessage request) returns ai:ChatRespMessage|error {
        string stringResult = check newsAgent.run(request.message, request.sessionId);
        return {message: stringResult};
    }
}
