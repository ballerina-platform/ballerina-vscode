type Coordinates record {|
    decimal latitude;
    decimal longitude;
|};

type City record {|
    string name;
    Coordinates location;
|};

enum Region {
    NORTH,
    SOUTH
}

public function main() {
}
