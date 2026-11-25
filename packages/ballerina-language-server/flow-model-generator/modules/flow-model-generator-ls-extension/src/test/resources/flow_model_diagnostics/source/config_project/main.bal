import ballerina/io;

# The host to connect to
configurable string host = "localhost";

public function main() {
    io:println(host, port);
}
