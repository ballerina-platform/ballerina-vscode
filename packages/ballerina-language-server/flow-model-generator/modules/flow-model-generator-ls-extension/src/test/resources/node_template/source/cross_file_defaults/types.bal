enum Region {
    US_EAST = "us-east-1",
    EU_WEST = "eu-west-1",
    AP_SOUTH = "ap-south-1"
}

const HIGH = "high";
const LOW = "low";
const MAX_RETRIES = 3;

type Priority HIGH|LOW;

type DeployOptions record {|
    Region fallbackRegion = US_EAST;
    int retries = MAX_RETRIES;
|};
