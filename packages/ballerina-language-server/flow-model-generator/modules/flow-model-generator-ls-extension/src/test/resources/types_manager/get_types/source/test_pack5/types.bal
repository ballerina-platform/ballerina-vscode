import ballerina/time;

# Record with a readonly field of an imported type
type Event record {|
    string id;
    readonly time:Date createdAt;
|};

# Record with readonly intersections inside an array and an optional field
type Schedule record {|
    (time:Civil & readonly)[] history;
    (time:TimeOfDay & readonly)? alarm;
|};
