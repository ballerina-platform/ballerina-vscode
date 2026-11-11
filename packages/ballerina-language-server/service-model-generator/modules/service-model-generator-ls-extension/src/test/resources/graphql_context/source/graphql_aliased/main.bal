import ballerina/graphql as gql;

listener gql:Listener graphqlListener = new (9090);

service /api/books on graphqlListener {
    resource function get greeting() returns string {
        return "Hello";
    }
}
