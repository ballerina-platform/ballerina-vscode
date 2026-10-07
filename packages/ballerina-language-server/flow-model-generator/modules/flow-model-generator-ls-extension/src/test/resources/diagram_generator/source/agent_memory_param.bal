import ballerina/ai;

final ai:Wso2ModelProvider model = check ai:getDefaultModelProvider();

function run(ai:Memory mem) returns error? {
    ai:Agent agent = check new (systemPrompt = {role: "a", instructions: "b"}, model = model, memory = mem, tools = []);
}
