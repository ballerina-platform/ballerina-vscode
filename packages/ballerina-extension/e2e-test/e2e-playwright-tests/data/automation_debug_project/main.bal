import ballerina/log;

public function main() returns error? {
    do {
        string var1 = "bar";
        string var2 = "foo";
        log:printInfo("Hello World");
    } on fail error e {
        log:printError("Error occurred", 'error = e);
        return e;
    }
}
