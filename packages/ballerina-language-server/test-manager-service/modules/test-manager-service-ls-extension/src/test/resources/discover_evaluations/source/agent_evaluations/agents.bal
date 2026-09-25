import ballerina/ai;

final ai:Agent mathAgent = check new (
    systemPrompt = {role: "Math Tutor", instructions: "Answer math questions."},
    model = check ai:getDefaultModelProvider(),
    tools = []
);

final ai:Agent supportAgent = check new (
    systemPrompt = {role: "Support", instructions: "Answer support questions."},
    model = check ai:getDefaultModelProvider(),
    tools = []
);
