import ballerina/io;

configurable string host = "localhost";

public function main() {
    io:println(host);
}
