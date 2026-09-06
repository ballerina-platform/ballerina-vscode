import ballerina/ai;

final ai:Wso2ModelProvider supportModel = check ai:getDefaultModelProvider();

// Delegates to specialistAgent (via delegateToSpecialist) and uses an http:Client (via callHttpTool).
final ai:Agent supervisorAgent = check new (
    systemPrompt = {role: "Supervisor", instructions: string `Route to a specialist.`},
    model = supportModel,
    tools = [delegateToSpecialist, callHttpTool]
);

final ai:Agent specialistAgent = check new (
    systemPrompt = {role: "Specialist", instructions: string `Handle the request.`},
    model = supportModel,
    tools = []
);

// No entry point and no delegation edge reaches this agent -- exercises the orphan case.
final ai:Agent orphanAgent = check new (
    systemPrompt = {role: "Orphan", instructions: string `Never called.`},
    model = supportModel,
    tools = []
);
