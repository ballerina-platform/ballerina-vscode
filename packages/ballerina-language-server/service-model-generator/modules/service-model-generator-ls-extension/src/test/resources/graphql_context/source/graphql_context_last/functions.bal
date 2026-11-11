import ballerina/graphql;
import ballerina/http;

isolated function graphqlContextInit(http:RequestContext requestContext, http:Request request) returns graphql:Context|error {
    graphql:Context context = new;
    context.set("scope", check request.getHeader("scope"));
    return context;
}

function helper() returns string {
    return "helper";
}
