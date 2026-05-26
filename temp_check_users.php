<?php
$conn = new mysqli('localhost', 'root', '', 'beautyhub');
if ($conn->connect_error) { die('connect_error: ' . $conn->connect_error); }
$result = $conn->query('SHOW COLUMNS FROM users');
if (!$result) { die('query_error: ' . $conn->error); }
while ($row = $result->fetch_assoc()) {
  echo $row['Field'] . '|' . $row['Type'] . PHP_EOL;
}
$conn->close();
?>
