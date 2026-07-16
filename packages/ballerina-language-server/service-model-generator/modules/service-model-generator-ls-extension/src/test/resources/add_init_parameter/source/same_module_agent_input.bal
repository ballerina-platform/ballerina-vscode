import ballerina/ai;

public isolated class CalendarAssistantAgent {
    *ai:FixedReturnAgentType;

    public isolated function run(string query) returns string|error {
        return query;
    }
}

public isolated class HostAgent {
    *ai:FixedReturnAgentType;

    private final ai:Agent agent;

    public function init(ai:ModelProvider model) returns error? {
        self.agent = check new (model = model);
    }
}
