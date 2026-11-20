import ballerina/jballerina.java;

type Person record {|
    string name;
|};

type Order record {
    int id;
};

type Album record {|
    string title;
    decimal price;
|};

type Row Person|Album;

type Albums Album[];

// rowTypes is an input to the call; the node's output type comes from targetType, which the call infers
function fetch(string query, typedesc<record {|anydata...;|}>[] rowTypes, typedesc<anydata> targetType = <>)
        returns targetType|error = @java:Method {
    'class: ""
} external;

public function main() returns error? {
    typedesc<record {|anydata...;|}> rowType = Album;
    Person first = check fetch("q1", [Person, Order, Row]);
    Albums albums = check fetch("q2", [rowType, Album], targetType = Albums);
    json raw = check fetch("q3", [typeof first, Order]);
    int count = check fetch("q4", []);
}
