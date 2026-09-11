import ballerina/http;

final http:Client helloClient = check new ("http://localhost:9090");

public function main() returns error? {
    string greeting = check helloClient->/hello(params = {"name": "Ballerina"});
}
