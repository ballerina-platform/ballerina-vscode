import ballerina/ai;

public isolated class MathTutorAgent {
    *ai:FixedReturnAgentType;

    private final ai:Agent agent;

    public function init(ai:ModelProvider model) returns error? {
        self.agent = check new (
            systemPrompt = {
                role: "Math Tutor",
                instructions: "You are a math tutor assistant."
            },
            tools = [self.sumTool],
            model = model
        );
    }

    public isolated function run(string query, string sessionId = "sessionId", ai:Context context = new)
            returns string|ai:Error => self.agent.run(query, sessionId, context);

    public isolated function trace(string query, string sessionId = "sessionId", ai:Context context = new)
            returns ai:Trace|ai:Error => self.agent.run(query, sessionId, context);

    @ai:AgentTool
    isolated function sumTool(float num1, float num2) returns float => num1 + num2;
}

final ai:ModelProvider _mathTutorModel = check ai:getDefaultModelProvider();
final MathTutorAgent mathTutorAgent = check new (_mathTutorModel);
