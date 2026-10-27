import ballerina/http;
import ballerina/io;

public function main() returns error? {
    http:Client c = check new ("http://localhost:9090");
    io:println("hi");
}

function handle(@http:Payload json body) {
}
