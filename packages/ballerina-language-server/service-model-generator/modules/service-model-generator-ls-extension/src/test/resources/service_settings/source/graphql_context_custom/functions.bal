import ballerina/graphql;
import ballerina/http;
import ballerina/log;

isolated function graphqlContextInit(http:RequestContext requestContext, http:Request request) returns graphql:Context|error {
    graphql:Context context = new;
    log:printInfo("building context");
    context.set("scope", check request.getHeader("scope"));
    return context;
}
