import ballerina/graphql;

listener graphql:Listener graphqlListener = new (9090);

# Books service.
@graphql:ServiceConfig {
    maxQueryDepth: 5,
    cors: {
        allowOrigins: ["*"]
    },
    introspection: false
}
service /graphql on graphqlListener {
    resource function get greeting() returns string {
        return "Hello";
    }
}
