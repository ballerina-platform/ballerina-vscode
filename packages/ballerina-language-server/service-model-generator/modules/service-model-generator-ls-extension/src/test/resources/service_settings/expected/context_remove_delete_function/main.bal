import ballerina/graphql;

listener graphql:Listener graphqlListener = new (9090);

service /graphql on graphqlListener {
    resource function get greeting(graphql:Context context) returns string|error {
        return (check context.get("scope")).toString();
    }
}
