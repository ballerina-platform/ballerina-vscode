import ballerina/graphql;
import ballerina/http;

function notAContextInit(http:Request request) returns string {
    return request.method;
}

isolated function graphqlContextInit(http:RequestContext requestContext, http:Request request) returns graphql:Context|error {
    graphql:Context context = new;
    return context;
}
