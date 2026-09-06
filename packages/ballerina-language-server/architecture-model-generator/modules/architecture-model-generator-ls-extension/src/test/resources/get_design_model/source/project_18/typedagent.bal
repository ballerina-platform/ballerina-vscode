import ballerina/ai;

// A typed-agent instance -- exercises the kind:"Agent" fix for isAiFixedTypedAgent classes.
class CustomSupportAgent {
    *ai:FixedTypedAgent;

    private final ai:Agent agent;

    public function init(ai:ModelProvider model) returns error? {
        self.agent = check new (
            systemPrompt = {role: string ``, instructions: string ``},
            tools = [],
            model = model
        );
    }
}

final CustomSupportAgent typedAgent = check new (supportModel);
