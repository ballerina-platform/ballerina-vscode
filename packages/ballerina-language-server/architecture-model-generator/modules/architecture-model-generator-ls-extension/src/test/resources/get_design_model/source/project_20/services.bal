import ballerina/http;

// Two agent calls in sequence, no branching -- exercises the ① ② sequence chips.
service /support on new http:Listener(8090) {
    resource function post ticket(@http:Payload string query) returns string|error {
        string _ = check supervisorAgent.run(query);
        return specialistAgent.run(query);
    }
}

// If / else-if / else, each branch calls a different agent -- exercises the conditional group.
service /route on new http:Listener(8091) {
    resource function post query(@http:Payload string query) returns string|error {
        if query.startsWith("billing") {
            return supervisorAgent.run(query);
        } else if query.startsWith("technical") {
            return specialistAgent.run(query);
        } else {
            return "unhandled";
        }
    }
}

// Match, one clause per pattern -- exercises the match group.
service /classify on new http:Listener(8092) {
    resource function post message(@http:Payload string query) returns string|error {
        match query {
            "billing" => {
                return supervisorAgent.run(query);
            }
            "technical" => {
                return specialistAgent.run(query);
            }
            _ => {
                return "unhandled";
            }
        }
    }
}

// Fork with two workers, each calling an agent -- exercises the fork group.
service /parallel on new http:Listener(8093) {
    resource function post both(@http:Payload string query) returns error? {
        fork {
            worker billing {
                string|error _ = supervisorAgent.run(query);
            }
            worker technical {
                string|error _ = specialistAgent.run(query);
            }
        }
        wait billing;
        wait technical;
    }
}

// `start agent.run(...)` -- exercises the design model descending into StartActionNode.
service /async on new http:Listener(8094) {
    resource function post notify(@http:Payload string query) returns error? {
        _ = start supervisorAgent.run(query);
    }
}

// Foreach over a list, one agent call per item -- exercises the foreach group.
service /batch on new http:Listener(8095) {
    resource function post triage(@http:Payload string[] queries) returns string[]|error {
        string[] results = [];
        foreach string query in queries {
            string verdict = check supervisorAgent.run(query);
            results.push(verdict);
        }
        return results;
    }
}

// While with a retry counter -- exercises the while group.
service /retry on new http:Listener(8096) {
    resource function post answer(@http:Payload string query) returns string|error {
        int attempts = 0;
        string answer = "";
        while attempts < 3 {
            answer = check specialistAgent.run(query);
            attempts += 1;
        }
        return answer;
    }
}

// Foreach with an if inside -- exercises the group stack, outermost first.
service /nested on new http:Listener(8097) {
    resource function post triage(@http:Payload string[] queries) returns error? {
        foreach string query in queries {
            if query.startsWith("billing") {
                _ = check supervisorAgent.run(query);
            } else {
                _ = check specialistAgent.run(query);
            }
        }
    }
}

// Calls through a local helper and through a service method keep their order -- exercises agentCalls expansion.
service /helpers on new http:Listener(8098) {
    resource function post pipeline(@http:Payload string query) returns string|error {
        return runPipeline(query);
    }

    resource function post mixed(@http:Payload string[] queries) returns string|error {
        string _ = check supervisorAgent.run(queries[0]);
        foreach string query in queries {
            _ = check self.finish(query);
        }
        return "done";
    }

    function finish(string query) returns string|error {
        return specialistAgent.run(query);
    }
}
