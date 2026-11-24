import ballerina/graphql;
import ballerina/http;

isolated function existingContextInit(http:RequestContext requestContext, http:Request request) returns graphql:Context|error {
    return new;
}

isolated function 'start(http:RequestContext requestContext, http:Request request) returns graphql:Context|error {
    return new;
}
