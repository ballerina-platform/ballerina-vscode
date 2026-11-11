import ballerina/http;
import ballerina/graphql;
@graphql:ServiceConfig {
    contextInit: graphqlContextInit
}
service /graphql on graphqlListener {
    resource function get greeting() returns string {
        return "Hello";
    }
}

isolated function graphqlContextInit(http:RequestContext requestContext, http:Request request) returns graphql:Context|error {
    graphql:Context context = new;
    return context;
}
