import ballerina/ai;

final ai:Agent aiAgent = check new (
    systemPrompt = {role: "Assistant", instructions: "Answer the question."},
    model = check ai:getDefaultModelProvider(), tools = []
);

function noErrorReturn() {
    int x = 1;
}

function errorReturn() returns error? {
    int x = 1;
}

function insideDo() {
    do {
        int x = 1;
    } on fail error e {
    }
}
