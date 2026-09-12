import ballerina/ai;

final ai:Wso2ModelProvider chatModel = check ai:getDefaultModelProvider();

final ai:Agent chatAgent = check new (
    systemPrompt = {role: "Assistant", instructions: string `Be helpful.`},
    model = chatModel,
    tools = []
);
