import ballerina/ai;

ai:SystemPrompt systemPrompt = {role: "Assistant", instructions: string `Answer clearly.`};

final ai:Agent chatAgent = check new (systemPrompt = systemPrompt, model = check ai:getDefaultModelProvider());

string role = "Tutor";
string tutorInstructions = string `Explain step by step.`;

final ai:Agent tutorAgent = check new (systemPrompt = {role, instructions: tutorInstructions}, model = check ai:getDefaultModelProvider());
