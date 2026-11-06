import ballerina/graphql;
import ballerina/http;

isolated function graphqlContextInit(http:RequestContext requestContext, http:Request request) returns graphql:Context|error {
    graphql:Context context = new;
    return context;
}
