import ballerina/graphql;
import ballerina/http;

isolated function graphqlContextInit(http:RequestContext requestContext, http:Request request) returns graphql:Context|error {
    graphql:Context context = new;
    context.set("scope", check request.getHeader("scope"));
    context.set("tenant", request.hasHeader("x-tenant") ? check request.getHeader("x-tenant") : ());
    context.set("page", check request.getQueryParamValue("page").ensureType(string));
    context.set("lang", request.getQueryParamValue("lang"));
    context.set("env", "prod \"blue\"");
    context.set("path", request.rawPath);
    return context;
}

function helper() returns string {
    return "helper";
}
