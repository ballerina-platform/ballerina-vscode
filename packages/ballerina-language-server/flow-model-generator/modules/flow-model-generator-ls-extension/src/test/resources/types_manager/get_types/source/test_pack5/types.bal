import ballerina/time;

# Record with a readonly field of an imported type
type Event record {|
    string id;
    readonly time:Date createdAt;
|};
