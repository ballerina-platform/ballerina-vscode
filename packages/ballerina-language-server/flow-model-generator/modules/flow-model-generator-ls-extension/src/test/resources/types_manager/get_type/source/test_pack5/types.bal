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
    readonly time:Date createdAt;
|};

# Record with a readonly intersection field without the readonly qualifier
type Tagged record {|
    readonly & time:Utc stamp;
|};

# Record with readonly fields before other fields
type Order record {|
    readonly record {|
        string name;
    |} labels;
    string name;
    readonly time:Date createdAt;
    readonly int[] codes;
    decimal price;
|};
