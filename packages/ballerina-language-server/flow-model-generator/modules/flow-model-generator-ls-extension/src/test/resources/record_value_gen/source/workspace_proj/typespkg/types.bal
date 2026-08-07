public type Person record {
    string name1;
    string name2;
    boolean isMale?;
};

public type Man record {
    string name1;
    string name2;
    boolean isMarried?;
};

public type Conn record {|
    string name1;
    Person|Man person;
|};
