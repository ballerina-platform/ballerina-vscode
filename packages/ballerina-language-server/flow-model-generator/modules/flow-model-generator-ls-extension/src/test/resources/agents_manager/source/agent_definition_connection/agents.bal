import ballerina/ai;
import ballerina/http as existingHttp;

public isolated class CalendarAgent {
    private final string token;
    private final ai:Agent agent;

    public function init(ai:ModelProvider model, string token) returns error? {
        self.token = token;
        self.agent = check new (
            systemPrompt = {role: string ``, instructions: string ``},
            tools = [],
            model = model
        );
    }
}
