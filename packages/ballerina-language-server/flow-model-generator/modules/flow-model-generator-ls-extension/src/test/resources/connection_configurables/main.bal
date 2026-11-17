type Config record {|
    string foo_bar?;
    string fooBar?;
    string? password = ();
    int|string size?;
    float timeout?;
    decimal rate?;
|};

type Pool record {|
    string? password = ();
|};
