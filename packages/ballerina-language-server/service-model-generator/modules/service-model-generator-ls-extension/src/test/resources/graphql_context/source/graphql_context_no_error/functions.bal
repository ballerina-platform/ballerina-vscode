import ballerina/graphql;
import ballerina/http;

isolated function graphqlContextInit(http:RequestContext requestContext, http:Request request) returns graphql:Context {
    graphql:Context context = new;
    context.set("tenant", "acme");
    return context;
}
