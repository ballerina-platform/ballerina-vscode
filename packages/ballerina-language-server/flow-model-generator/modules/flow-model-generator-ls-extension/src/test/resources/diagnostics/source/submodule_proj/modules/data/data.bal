public type Row record {|
    string id;
|};

public function makeRow(string id) returns Row => {id: id};
