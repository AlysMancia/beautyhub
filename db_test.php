<?php
$servername = "localhost";
$username = "root";
$password = "";
$dbname = "beautyhub";  // Replace with your actual DB name

$conn = new mysqli($servername, $username, $password, $dbname);

if ($conn->connect_error) {
    die("Connection failed: " . $conn->connect_error);
} else {
    echo "✅ Connected successfully!";
}

$conn->close();
?>
