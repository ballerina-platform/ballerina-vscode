import ballerina/ai;

final ai:Wso2ModelProvider customerSupportModel = check ai:getDefaultModelProvider();

final ai:Agent mathTutorAgent = check new ai:Agent(
    systemPrompt = {
        role: string `Customer Support Assistant`,
        instructions: string `You are a helpful assistant`
    }, model = customerSupportModel
);
