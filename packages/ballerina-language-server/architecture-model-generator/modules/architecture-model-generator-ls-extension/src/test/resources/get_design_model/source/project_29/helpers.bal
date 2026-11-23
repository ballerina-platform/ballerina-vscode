isolated function runScreening() returns string|error {
    return screenOne("next");
}

isolated function screenOne(string id) returns string|error {
    return screeningAgent.run("Screen application " + id);
}

isolated function runShortlistAgent(string jobId) returns string|error {
    error lastError = error("Shortlist agent did not run");
    foreach int attempt in 1 ... 2 {
        do {
            string result = check shortlistAgent.run("Shortlist " + jobId);
            return result;
        } on fail error failure {
            lastError = failure;
        }
    }
    return lastError;
}

isolated function runScheduling() returns error? {
    future<string|error> pending = start offerSlots();
    _ = check wait pending;
}

isolated function offerSlots() returns string|error {
    return schedulingAgent.run("Offer slots");
}

isolated function askOrchestrator(string text) returns string|error {
    return orchestratorAgent.run("Summarise: " + text);
}

isolated function readStatus() returns string|error {
    return statusApi->get("/status");
}

isolated function process() returns string|error {
    return shortlistAgent.run("Process from the module");
}

isolated function runAudit(string decision) returns string|error {
    return auditAgent.run("Audit " + decision);
}
