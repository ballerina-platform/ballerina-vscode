import ballerina/ai;

public isolated class CalendarAgent {
    *ai:FixedTypedAgent;

    private final string token;
    private final WeatherMcpToolKit weatherMcp;
    private final ai:Agent specialistAgent;
    private final ai:Agent agent;

    public function init(ai:ModelProvider model, string token) returns error? {
        self.token = token;
        self.weatherMcp = check new (self.token);
        self.agent = check new (
            systemPrompt = {role: string ``, instructions: string ``},
            tools = [self.weatherMcp, self.askSpecialist],
            model = model
        );
        self.specialistAgent = check new (
            systemPrompt = {role: string ``, instructions: string ``},
            tools = [],
            model = model
        );
    }

    @ai:AgentTool
    public isolated function askSpecialist(string prompt) returns string|error {
        return check self.specialistAgent.run(prompt);
    }
}

isolated class WeatherMcpToolKit {
    *ai:McpBaseToolKit;

    public isolated function init(string serverUrl) {
    }

    public isolated function getTools() returns ai:ToolConfig[] => [];
}
