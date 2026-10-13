import ballerina/ai;

final ai:Wso2ModelProvider greeterModel = check ai:getDefaultModelProvider();

final ai:Agent greeterAgent = check new (
    systemPrompt = {
        role: string `Greeter`,
        instructions: string `Greet the user warmly and keep replies to one sentence.`
    }, model = greeterModel
);
