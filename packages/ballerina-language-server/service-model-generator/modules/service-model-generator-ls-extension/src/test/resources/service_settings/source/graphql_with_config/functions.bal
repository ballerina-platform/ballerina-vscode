import ballerina/http;

function notAContextInit(http:Request request) returns string {
    return request.method;
}
