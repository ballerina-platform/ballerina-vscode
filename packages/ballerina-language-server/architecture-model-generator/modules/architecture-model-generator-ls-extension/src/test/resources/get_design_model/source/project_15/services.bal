import ballerina/ai;
import ballerina/http;

final http:Client healthClient = check new ("http://localhost:9090");

// Uses the agent -- expected to link to mathTutorAgent.
service /mathService on new http:Listener(8080) {
    resource function post chat(@http:Payload string query) returns string|error {
        return mathTutorAgent.run(query);
    }
}

// Does not use the agent -- negative control.
service /healthService on new http:Listener(8081) {
    resource function get status() returns string|error {
        return healthClient->get("/status");
    }
}

// Service-scoped agent field -- exercises the `self.<field>` branch of isAiMethodCall.
service /supportService on new http:Listener(8082) {
    final ai:Agent supportAgent;

    function init() returns error? {
        self.supportAgent = check new (
            systemPrompt = {role: "Support", instructions: string `Answer support questions.`},
            model = mathTutorModel,
            tools = []
        );
    }

    resource function post chat(@http:Payload string query) returns string|error {
        return self.supportAgent.run(query);
    }
}

// Reaches the agent only transitively, via askTutor() in functions.bal.
service /indirectService on new http:Listener(8083) {
    resource function get answer() returns string|error {
        return askTutor();
    }
}
