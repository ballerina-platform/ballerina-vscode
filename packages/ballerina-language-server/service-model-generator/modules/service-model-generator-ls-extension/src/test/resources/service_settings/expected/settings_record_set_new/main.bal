import ballerina/graphql;

listener graphql:Listener graphqlListener = new (9090);

@graphql:ServiceConfig {
    graphiql: {enabled: true}
}
service /graphql on graphqlListener {
    resource function get greeting() returns string {
        return "Hello";
    }
}
