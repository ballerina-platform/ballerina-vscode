import ballerina/time;

# Record with a readonly anonymous record field
type Item record {|
    string name;
    readonly record {|
        string name;
    |} labels;
|};

# Record with a readonly field of an imported type
type Event record {|
    string id;
    readonly time:Utc createdAt;
|};

# Record with a readonly intersection field without the readonly qualifier
type Tagged record {|
    readonly & time:Utc stamp;
|};
