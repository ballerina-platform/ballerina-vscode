import ballerina/ai;

final ai:Wso2ModelProvider myModel = check ai:getDefaultModelProvider();
final string role = "Customer support assistant";
final string instructions = "Help customers with their questions.";
