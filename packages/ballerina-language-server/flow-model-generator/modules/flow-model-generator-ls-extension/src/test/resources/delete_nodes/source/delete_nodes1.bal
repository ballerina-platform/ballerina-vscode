import ballerina/log;

public function main() {
    int count = 3;
    if count > 1 {
        log:printInfo("first");
    } else {
        log:printInfo("second");
    }
    log:printInfo("third");
}
