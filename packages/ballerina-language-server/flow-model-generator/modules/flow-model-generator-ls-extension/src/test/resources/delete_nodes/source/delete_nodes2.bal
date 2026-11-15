import ballerina/http;
import ballerina/log;

public function main() returns error? {
    int count = 3;
    do {
        http:Client c = check new ("http://localhost:9090");
    } on fail error e {
        log:printError("failed", e);
    }
}
