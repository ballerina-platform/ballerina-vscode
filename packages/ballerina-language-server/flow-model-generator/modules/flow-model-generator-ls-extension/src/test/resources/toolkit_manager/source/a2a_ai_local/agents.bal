import ballerina/ai;

final ai:Agent assistant = check new (
    systemPrompt = {role: "Assistant", instructions: "Help."},
    model = check ai:getDefaultModelProvider()
);
