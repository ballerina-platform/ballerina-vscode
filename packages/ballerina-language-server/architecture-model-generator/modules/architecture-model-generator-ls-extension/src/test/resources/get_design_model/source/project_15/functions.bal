// Plain module-level function caller -- not an entry point, and not reachable from one.
function askTutor() returns string|error {
    return mathTutorAgent.run("1 + 1");
}
