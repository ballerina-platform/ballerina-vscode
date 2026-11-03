import ballerina/graphql;

listener graphql:Listener graphqlListener = new (9090);

@graphql:ServiceConfig {
    contextInit: graphqlContextInit
}
service /graphql on graphqlListener {
    resource function get greeting(graphql:Context context) returns string|error {
        return (check context.get("scope")).toString();
    }
}
