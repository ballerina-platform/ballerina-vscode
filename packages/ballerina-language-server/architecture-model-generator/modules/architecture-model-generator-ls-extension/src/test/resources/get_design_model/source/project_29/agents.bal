import ballerina/ai;
import ballerina/http;

final ai:Wso2ModelProvider orchestrationModel = check ai:getDefaultModelProvider();

// Reaches every other agent only through helper functions -- exercises delegation through helpers.
final ai:Agent orchestratorAgent = check new (
    systemPrompt = {role: "Orchestrator", instructions: string `Run the pipeline steps.`},
    model = orchestrationModel,
    tools = [screenApplications, buildShortlist, scheduleInterviews, summarise, fetchStatus]
);

final http:Client screeningStore = check new ("http://localhost:9301");

// Its tool uses screeningStore; that client belongs to this agent's card, not to the orchestrator's.
final ai:Agent screeningAgent = check new (
    systemPrompt = {role: "Screener", instructions: string `Screen one application.`},
    model = orchestrationModel,
    tools = [readApplication]
);

final ai:Agent shortlistAgent = check new (
    systemPrompt = {role: "Shortlister", instructions: string `Rank the screened candidates.`},
    model = orchestrationModel,
    tools = []
);

final ai:Agent schedulingAgent = check new (
    systemPrompt = {role: "Scheduler", instructions: string `Offer interview slots.`},
    model = orchestrationModel,
    tools = []
);
