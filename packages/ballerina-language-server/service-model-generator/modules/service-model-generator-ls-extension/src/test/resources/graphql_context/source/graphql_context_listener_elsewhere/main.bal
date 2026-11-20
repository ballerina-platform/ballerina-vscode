import ballerina/graphql;

@graphql:ServiceConfig {
    contextInit: graphqlContextInit
}
service /graphql on graphqlListener {
    resource function get greeting() returns string {
        return "Hello";
    }
}
