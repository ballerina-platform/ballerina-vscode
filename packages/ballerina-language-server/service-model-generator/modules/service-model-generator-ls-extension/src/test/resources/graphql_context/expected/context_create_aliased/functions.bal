import ballerina/http;
import ballerina/graphql;

isolated function apiBooksContextInit(http:RequestContext requestContext, http:Request request) returns graphql:Context|error {
    graphql:Context context = new;
    return context;
}
