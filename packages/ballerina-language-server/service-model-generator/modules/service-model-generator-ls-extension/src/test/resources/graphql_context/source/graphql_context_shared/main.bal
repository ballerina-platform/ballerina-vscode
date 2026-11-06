import ballerina/graphql;

listener graphql:Listener graphqlListener = new (9090);

@graphql:ServiceConfig {
    contextInit: graphqlContextInit
}
service /graphql on graphqlListener {
    resource function get greeting() returns string {
        return "Hello";
    }
}

@graphql:ServiceConfig {
    contextInit: graphqlContextInit
}
service /admin on graphqlListener {
    resource function get status() returns string {
        return "ok";
    }
}
