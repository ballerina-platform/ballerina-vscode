import ballerina/ai;

type BillingResponse record {|
    string answer;
|};

public isolated class BillingAgent {
    *ai:FixedReturnAgentType;

    public isolated function run(string query, ai:Context? context = ()) returns BillingResponse|error {
        return {answer: query};
    }
}

public isolated class SupportAgent {
    *ai:FixedReturnAgentType;

    private final ai:Agent agent;
    private final ai:Agent helperAgent;
    private final BillingAgent billingAgent;

    public function init(ai:ModelProvider model, ai:Agent helperAgent, BillingAgent billingAgent) returns error? {
        self.helperAgent = helperAgent;
        self.billingAgent = billingAgent;
        self.agent = check new (
            systemPrompt = {role: string ``, instructions: string ``},
            tools = [],
            model = model
        );
    }
}
