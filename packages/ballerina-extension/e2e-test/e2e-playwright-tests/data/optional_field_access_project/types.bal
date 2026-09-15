type Meta record {|
    string documentId;
    string label?;
|};

type Doc record {|
    string name;
    Meta? meta;
    string docId?;
|};
