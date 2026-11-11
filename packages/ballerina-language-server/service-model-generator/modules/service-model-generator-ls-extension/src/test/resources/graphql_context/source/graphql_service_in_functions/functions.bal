service /graphql on graphqlListener {
    resource function get greeting() returns string {
        return "Hello";
    }
}
