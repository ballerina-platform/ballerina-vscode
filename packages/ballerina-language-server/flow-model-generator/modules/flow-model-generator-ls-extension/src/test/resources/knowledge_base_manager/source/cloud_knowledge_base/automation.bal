import ballerina/ai;
import ballerina/log;

public function main() returns error? {
    do {
        ai:QueryMatch[] aiQuerymatch = check cloudKnowledgeBase.retrieve("query");
    } on fail error e {
        log:printError("Error occurred", 'error = e);
        return e;
    }
}
