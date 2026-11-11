import ballerina/http;
import ballerina/io;
import ballerina/log;

public function main() returns error? {
    http:Client c = check new ("http://localhost:9090");
    io:println("hi");
}
