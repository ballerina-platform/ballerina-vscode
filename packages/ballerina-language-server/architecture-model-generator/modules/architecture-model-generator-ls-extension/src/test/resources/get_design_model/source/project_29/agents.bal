import ballerina/ai;
import ballerina/http;

final ai:Wso2ModelProvider orchestrationModel = check ai:getDefaultModelProvider();

// Reaches every other agent only through helper functions -- exercises delegation through helpers.
final ai:Agent orchestratorAgent = check new (
    systemPrompt = {role: "Orchestrator", instructions: string `Run the pipeline steps.`},
    model = orchestrationModel,
    tools = [screenApplications, buildShortlist, scheduleInterviews, summarise, fetchStatus, triage, processAll,
        audit]
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

// Agent definition class as the caller: its @ai:AgentTool methods reach other agents through `self.` helpers.
isolated class ReviewAgent {
    *ai:FixedTypedAgent;

    private final ai:Agent reviewer;

    public isolated function run(string|ai:Prompt query, string sessionId = "default",
            ai:Context context = new) returns string|ai:Error {
        return self.reviewer.run(query, sessionId, context);
    }

    public isolated function trace(string|ai:Prompt query, string sessionId = "default",
            ai:Context context = new) returns ai:Trace|ai:Error {
        return self.reviewer.run(query, sessionId, context);
    }

    public isolated function init(ai:ModelProvider model) returns error? {
        self.reviewer = check new (
            systemPrompt = {role: string `Reviewer`, instructions: string `Review a candidate.`},
            tools = [self.search],
            model = model
        );
    }

    // tool method -> self.helper() -> agent.run(...)
    @ai:AgentTool
    isolated function search(string query) returns string|error {
        return self.findCandidate(query);
    }

    isolated function findCandidate(string query) returns string|error {
        return screeningAgent.run("Find " + query);
    }

    // Not a tool; shares its name with the module-level process() so the two must not be confused.
    isolated function process() returns string|error {
        return schedulingAgent.run("Process from the class");
    }
}

final ReviewAgent reviewAgent = check new (orchestrationModel);

// Agent definition class as a delegation target (reached by the audit tool through a helper). Its `search` tool
// has the same name as ReviewAgent.search but uses a client instead of an agent.
isolated class AuditAgent {
    *ai:FixedTypedAgent;

    private final ai:Agent auditor;

    public isolated function run(string|ai:Prompt query, string sessionId = "default",
            ai:Context context = new) returns string|ai:Error {
        return self.auditor.run(query, sessionId, context);
    }

    public isolated function trace(string|ai:Prompt query, string sessionId = "default",
            ai:Context context = new) returns ai:Trace|ai:Error {
        return self.auditor.run(query, sessionId, context);
    }

    public isolated function init(ai:ModelProvider model) returns error? {
        self.auditor = check new (
            systemPrompt = {role: string `Auditor`, instructions: string `Audit a decision.`},
            tools = [self.search],
            model = model
        );
    }

    @ai:AgentTool
    isolated function search(string query) returns string|error {
        return auditStore->get("/audit/" + query);
    }
}

final http:Client auditStore = check new ("http://localhost:9303");

final AuditAgent auditAgent = check new (orchestrationModel);
