import ballerina/ai;

final ai:Wso2ModelProvider mathTutorModel = check ai:getDefaultModelProvider();

final ai:Agent mathTutorAgent = check new (
    systemPrompt = {role: "Math Tutor", instructions: string `Solve arithmetic problems.`},
    model = mathTutorModel,
    tools = [sum]
);

@ai:AgentTool
isolated function sum(decimal[] numbers) returns string {
    decimal total = 0;
    foreach decimal number in numbers {
        total += number;
    }
    return string `Answer is: ${total}`;
}
