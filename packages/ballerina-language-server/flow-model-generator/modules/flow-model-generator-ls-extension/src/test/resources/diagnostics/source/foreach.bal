public function main() {
    
}

class Counter {
    *object:Iterable;

    public function iterator() returns object {
        public function next() returns record {|int value;|}?;
    } {
        return object {
            public function next() returns record {|int value;|}? {
                return ();
            }
        };
    }
}

class NonIterable {
    public function iterator() returns object {
        public function next() returns record {|int value;|}?;
    } {
        return object {
            public function next() returns record {|int value;|}? {
                return ();
            }
        };
    }
}

table<map<int>> tbl = table [{a: 1}];
xml xmlVal = xml `<a/>`;
stream<int> intStream = [1, 2].toStream();
stream<int, error?> errStream = [1, 2].toStream();
json jsonVal = [1, 2];
Counter counter = new;
NonIterable nonIterable = new;
