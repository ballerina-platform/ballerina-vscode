import ballerina/ai;

final ai:Wso2ModelProvider tripModel = check ai:getDefaultModelProvider();

final ai:Agent tripPlanner = check new (
    systemPrompt = {role: "Trip Planner", instructions: string `Plan a one-day itinerary.`},
    model = tripModel,
    tools = []
);
