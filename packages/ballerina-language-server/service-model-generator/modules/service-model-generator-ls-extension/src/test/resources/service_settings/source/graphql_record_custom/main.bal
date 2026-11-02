import ballerina/graphql;

const GRAPHIQL_PATH = "playground";

final graphql:CorsConfig corsConfig = {allowOrigins: ["*"]};

listener graphql:Listener graphqlListener = new (9090);

@graphql:ServiceConfig {
    graphiql: {enabled: true, path: GRAPHIQL_PATH},
    cors: corsConfig,
    cacheConfig: {maxAge: 30.5, maxSize: 0x10}
}
service /graphql on graphqlListener {
    resource function get greeting() returns string {
        return "Hello";
    }
}
