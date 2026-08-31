import ballerina/ai;

final ai:Agent aiAgent = check new (
    systemPrompt = {role: string `Email Agent`, instructions: string `Email Agent`}, model = check ai:getDefaultModelProvider()
);
