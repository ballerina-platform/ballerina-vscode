import ballerina/ai;
import ballerina/ai.eval;
import ballerina/test;

isolated function loadQueries() returns string[][] {
    return [["What is 2 + 2?"]];
}

@test:Config {groups: ["evaluations"], dataProvider: loadQueries}
function evaluateMathAgentClarity(string query) returns error? {
    check eval:evaluateClarity(targetAgent = mathAgent, queries = query,
            judgeModel = check ai:getDefaultModelProvider());
}

@test:Config {groups: ["evaluations"], dataProvider: loadQueries}
function testMathAgentAnswers(string query) returns error? {
    string answer = check mathAgent.run(query);
    test:assertTrue(answer.length() > 0);
}

@test:Config {groups: ["evaluations"], dataProvider: loadQueries}
function testSupportThenMath(string query) returns error? {
    string answer = check askSupport(query);
    string checked = check mathAgent.run(answer);
    test:assertTrue(checked.length() > 0);
}

@test:Config {groups: ["evaluations"]}
function testWithoutAgent() {
    test:assertTrue(true);
}

@test:Config
function testNotAnEvaluation() returns error? {
    _ = check supportAgent.run("hello");
}

function askSupport(string query) returns string|error {
    return supportAgent.run(query);
}

isolated function loadMathThreads() returns map<[ai:ConversationThread]>|error {
    return ai:loadConversationThreads("tests/resources/evalsets/math.evalset.json");
}

@test:Config {groups: ["evaluations"], dataProvider: loadMathThreads}
function testMathAgentWithEvalset(ai:ConversationThread thread) returns error? {
    foreach ai:Trace trace in thread.traces {
        string answer = check mathAgent.run(trace.userMessage.content.toString(), thread.id);
        test:assertTrue(answer.length() > 0);
    }
}
