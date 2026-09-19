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

public type DestConfig record {|
    string ashost;
|};

public type AdvConfig map<string>;
