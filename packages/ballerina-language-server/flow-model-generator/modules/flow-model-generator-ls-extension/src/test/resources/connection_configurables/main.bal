type Config record {|
    string foo_bar?;
    string fooBar?;
    string? password = ();
    int|string size?;
|};

type Pool record {|
    string? password = ();
|};
