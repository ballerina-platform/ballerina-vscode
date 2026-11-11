import ballerina/graphql;

listener graphql:Listener graphqlListener = new (9090);

@graphql:ServiceConfig {
    maxQueryDepth: 5,
    contextInit: graphqlContextInit
}
service /graphql on graphqlListener {
    resource function get greeting(graphql:Context context) returns string|error {
        return (check context.get("scope")).toString();
    }
}
