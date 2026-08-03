import ballerina/http;

final http:Client currencyClient = check new ("http://localhost:9090");
