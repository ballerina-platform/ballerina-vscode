import ballerina/file as ftp;
import ballerina/ftp as ftp2;

listener ftp2:Listener ftpListener = new (host = "localhost", protocol = ftp2:FTP, port = 21);

service ftp2:Service on ftpListener {
}
