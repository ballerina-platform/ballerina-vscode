import ballerina/log;

public function main() {
    do {
        string var1 = function1(2, "");
    } on fail error e {
        log:printError("Error occurred", 'error = e);
    }
}

function function1(int a, string b) returns string|error {
    return b + a.toBalString();
}
