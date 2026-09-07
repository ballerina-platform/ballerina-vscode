import ballerina/ai;

// A typed-agent instance -- exercises the kind:"Agent" fix for isAiFixedTypedAgent classes.
class CustomSupportAgent {
    *ai:FixedTypedAgent;

    private final ai:Agent agent;

    public function init(ai:ModelProvider model) returns error? {
        self.agent = check new (
            systemPrompt = {role: string ``, instructions: string ``},
            tools = [self.lookupTicket, self.escalate],
            model = model
        );
    }

    @ai:AgentTool
    isolated function lookupTicket(string id) returns string {
        return string `ticket ${id}`;
    }

    // Uses an http:Client from a class-method tool -- exercises toolConnections on a typed agent.
    @ai:AgentTool
    isolated function escalate(string id) returns string|error {
        return billingClient->get(string `/escalate/${id}`);
    }
}

final CustomSupportAgent typedAgent = check new (supportModel);
