import ballerina/ai;

@ai:AgentTool
isolated function calculateSum(int a, int b) returns int {
    return a + b;
}

# Returns the forecast for a location.
@ai:AgentTool
isolated function getWeather(string location) returns json {
    return {
        "location": location,
        "temperature": 25,
        "condition": "sunny"
    };
}

isolated function regularFunction(string text) returns string {
    return "Hello " + text;
}

@ai:AgentTool
isolated function processData(json data) returns json {
    return data;
}
