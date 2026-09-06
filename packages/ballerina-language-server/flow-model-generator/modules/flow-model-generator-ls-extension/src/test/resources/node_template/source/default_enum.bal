function function1() {
    function2("Tuesday");
}

function function2(Day day = Wednesday) {
}

enum Day {
    Monday,
    Tuesday,
    Wednesday,
    Thursday,
    Friday,
    Saturday,
    Sunday
}

function function3(Day[] days) {
}

function function4() {
}

function function5(Day? day = ()) {
}

function function6(Day|int day = Wednesday) {
}

function function7(Day|string day = "Monday") {
}

enum Priority {
    HIGH = "10",
    MEDIUM = "5",
    LOW = "1"
}

function function8(Priority? priority = MEDIUM) {
}
