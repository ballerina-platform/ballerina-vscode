import ballerina/graphql;
import ballerina/http;

type Profile record {|
    string name;
    int age;
|};

type ProfileInput record {|
    string name;
    int age;
|};

type Profiles Profile[];

type MaybeProfile Profile?;

type ProfileResult Profile|error;

type Email string;

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

    // Aliases that are not schema types of their own show the shape they name.
    resource function get profileList() returns Profiles {
        return [];
    }

    resource function get maybeProfile() returns MaybeProfile {
        return ();
    }

    resource function get profileResult() returns ProfileResult {
        return {name: "", age: 0};
    }

    resource function get email() returns Email {
        return "";
    }

    resource function get frozenProfile() returns readonly & Profile {
        return {name: "", age: 0};
    }

    resource function get profileTable() returns table<Profile> {
        return table [];
    }

    resource function get byIds(@graphql:ID string[] ids, graphql:Field 'field) returns Profile[] {
        return [];
    }

    resource function subscribe updates() returns stream<Profile, error?>|error {
        return [].toStream();
    }
}

// Declared after the GraphQL service: its functions must not be treated as GraphQL fields.
service /rest on new http:Listener(9091) {

    resource function get greeting() returns string {
        return "Hello";
    }
}
