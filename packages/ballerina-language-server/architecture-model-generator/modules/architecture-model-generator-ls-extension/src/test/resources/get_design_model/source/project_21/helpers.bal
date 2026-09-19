// A module-level helper that runs two agents in sequence.
function runPipeline(string query) returns string|error {
    string plan = check supervisorAgent.run(query);
    return specialistAgent.run(plan);
}
