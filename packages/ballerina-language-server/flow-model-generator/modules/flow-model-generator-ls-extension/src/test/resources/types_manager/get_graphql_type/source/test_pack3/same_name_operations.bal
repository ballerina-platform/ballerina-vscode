import ballerina/graphql;

type Book record {|
    string title;
|};

type Author record {|
    string name;
|};

service graphql:Service /library on new graphql:Listener(9090) {
    resource function get item() returns Book {
        return {title: ""};
    }

    remote function item() returns Author {
        return {name: ""};
    }
}
