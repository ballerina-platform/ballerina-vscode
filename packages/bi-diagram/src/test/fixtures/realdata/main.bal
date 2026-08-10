import ballerina/io;

public function main() {
    string greeting = "Hello";
    int count = 3;
    if count > 0 {
        io:println(greeting);
    }
}
