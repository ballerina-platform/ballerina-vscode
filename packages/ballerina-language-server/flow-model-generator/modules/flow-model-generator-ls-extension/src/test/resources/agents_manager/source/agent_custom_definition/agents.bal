import ballerina/ai;

class CustomAgent {
    private final ai:Agent agent;

    public function init(ai:ModelProvider model) returns error? {
        self.agent = check new (
            systemPrompt = {role: string ``, instructions: string ``},
            tools = [],
            model = model
        );
    }
}
