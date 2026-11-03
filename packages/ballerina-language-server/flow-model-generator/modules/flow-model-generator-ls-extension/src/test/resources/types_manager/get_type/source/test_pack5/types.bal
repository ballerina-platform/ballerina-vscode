import ballerina/time;

# Record with readonly fields before other fields, and a readonly intersection field without the readonly qualifier
type Order record {|
    readonly record {|
        string name;
    |} labels;
    string name;
    readonly time:Date createdAt;
    readonly int[] codes;
    readonly & time:Utc stamp;
    decimal price;
|};
