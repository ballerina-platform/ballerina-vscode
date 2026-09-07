import ballerina/ai;

final ai:Wso2ModelProvider supportModel = check ai:getDefaultModelProvider();

// Delegates to specialistAgent (via delegateToSpecialist) and uses an http:Client (via callHttpTool).
final ai:Agent supervisorAgent = check new (
    systemPrompt = {role: "Supervisor", instructions: string `Route to a specialist.`},
    model = supportModel,
    tools = [delegateToSpecialist, callHttpTool]
);

final ai:MessageWindowChatMemory sharedMemory = new (10);

final ai:Agent specialistAgent = check new (
    systemPrompt = {role: "Specialist", instructions: string `Handle the request.`},
    model = supportModel,
    memory = sharedMemory,
    tools = []
);

// No entry point and no delegation edge reaches this agent -- exercises the orphan case.
final ai:Agent orphanAgent = check new (
    systemPrompt = {role: "Orphan", instructions: string `Never called.`},
    model = supportModel,
    tools = []
);

// Inline default provider -- no provider variable exists, so the agent records the default marker itself.
final ai:Agent inlineModelAgent = check new (
    systemPrompt = {role: "Inline", instructions: string `Uses the default model provider inline.`},
    model = check ai:getDefaultModelProvider(),
    memory = new ai:MessageWindowChatMemory(5),
    tools = []
);
