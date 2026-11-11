import ballerina/graphql;

listener graphql:Listener graphqlListener = new (9090);
