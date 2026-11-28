import ballerina/http;

final http:Client moduleClient = check new ("http://localhost:9090");

function uncheckedClient() returns string {
    http:Client|error idp = new ("http://localhost:9090");
    if idp is error {
        return idp.message();
    }
    return "ok";
}

function checkedClient() returns error? {
    http:Client cl = check new ("http://localhost:9090");
}
