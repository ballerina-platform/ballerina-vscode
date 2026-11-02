import ballerina/graphql;

listener graphql:Listener graphqlListener = new (9090);

@graphql:ServiceConfig {
    cacheConfig: {maxAge: 30.5, maxSize: 500}
}
service /graphql on graphqlListener {
    resource function get greeting() returns string {
        return "Hello";
    }
}
