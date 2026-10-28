import ballerina/graphql;

type Profile record {|
    string name;
    int age;
|};

type ProfileInput record {|
    string name;
    int age;
|};

listener graphql:Listener graphqlListener = new (9090);

service /graphql on graphqlListener {

    resource function get greeting() returns string {
        return "Hello";
    }

    # Fetch a profile by its id.
    # + id - The profile id
    resource function get profile(@graphql:ID string id) returns Profile? {
        return ();
    }

    resource function get profiles(int 'limit = 10, string? filter = ()) returns Profile[]|error {
        return [];
    }

    resource function get 'type() returns string {
        return "type";
    }

    resource function get account/name() returns string {
        return "name";
    }

    @deprecated
    resource function get legacyGreeting() returns string {
        return "Hi";
    }

    remote function addProfile(ProfileInput input) returns Profile {
        return {name: input.name, age: input.age};
    }

    resource function subscribe ticks() returns stream<int, error?> {
        return [1, 2, 3].toStream();
    }
}
