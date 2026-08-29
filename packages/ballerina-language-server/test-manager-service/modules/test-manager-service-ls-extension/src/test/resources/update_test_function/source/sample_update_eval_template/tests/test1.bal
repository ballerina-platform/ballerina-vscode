import ballerina/test;
import ballerina/ai;
import ballerina/ai.eval;

@test:Config {dataProvider: loadEvalsetData}
function evaluateThread(ai:ConversationThread thread) returns error? {
    check eval:semanticSimilarity(data = thread);
}

isolated function loadEvalsetData() returns ai:ConversationThread[]|error {
    return check ai:loadConversationThreads("resources/old.json");
}
