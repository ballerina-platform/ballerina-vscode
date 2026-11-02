import ballerina/graphql;

listener graphql:Listener graphqlListener = new (9090);

@graphql:ServiceConfig {
    queryComplexityConfig: {}
}
service /graphql on graphqlListener {
    resource function get greeting() returns string {
        return "Hello";
    }
}
