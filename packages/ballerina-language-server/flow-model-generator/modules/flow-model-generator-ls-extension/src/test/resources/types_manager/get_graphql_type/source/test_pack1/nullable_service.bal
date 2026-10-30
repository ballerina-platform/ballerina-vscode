import ballerina/graphql;

type Contact record {|
    string name;
    string? phone;
    int age?;
    readonly & Address address;
|};

type Address record {|
    string city;
|};

service /contacts on new graphql:Listener(9093) {

    resource function get contact() returns Contact {
        return {name: "", phone: (), address: {city: ""}};
    }

    resource function subscribe contacts() returns stream<Contact, error?>|error {
        return [].toStream();
    }
}
