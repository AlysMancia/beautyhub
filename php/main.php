<?php
header('Content-Type: application/json; charset=utf-8');
mysqli_report(MYSQLI_REPORT_OFF);

$host = 'localhost';
$user = 'root';
$pass = '';
$db = $_ENV['BEAUTYHUB_DB_NAME'] ?? 'beautyhub';

$conn = @new mysqli($host, $user, $pass, $db);
if ($conn->connect_error) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => "Database connection failed. Check DB name '$db' in php/main.php.",
        'error' => $conn->connect_error,
    ]);
    exit;
}

$functionName = $_POST['FunctionName'] ?? '';

switch ($functionName) {
    case 'create_user':
        create_user($conn);
        break;
    case 'login_user':
        login_user($conn);
        break;
    case 'logout_user':
        logout_user();
        break;
    case 'all_users_email':
        all_users_email($conn);
        break;
    case 'get_user_info':
        get_user_info($conn);
        break;
    default:
        echo json_encode([
            'success' => false,
            'message' => 'Invalid FunctionName.',
        ]);
        break;
}

$conn->close();

function create_user($conn) {
    $firstName = trim($_POST['Firstname'] ?? '');
    $lastName = trim($_POST['Lastname'] ?? '');
    $username = trim($_POST['username'] ?? '');
    $email = trim($_POST['email'] ?? '');
    $password = trim($_POST['password'] ?? '');

    if ($firstName === '' || $lastName === '' || $username === '' || $email === '' || $password === '') {
        echo json_encode(['success' => false, 'message' => 'Missing required signup fields.']);
        return;
    }

    $name = trim($firstName . ' ' . $lastName);

    $checkStmt = $conn->prepare('SELECT id FROM users WHERE email = ? LIMIT 1');
    if (!$checkStmt) {
        echo json_encode(['success' => false, 'message' => 'Failed to prepare duplicate check.', 'error' => $conn->error]);
        return;
    }

    $checkStmt->bind_param('s', $email);
    $checkStmt->execute();
    $checkResult = $checkStmt->get_result();
    if ($checkResult && $checkResult->num_rows > 0) {
        $checkStmt->close();
        echo json_encode(['success' => false, 'message' => 'Email is already registered.']);
        return;
    }
    $checkStmt->close();

    $hash = password_hash($password, PASSWORD_DEFAULT);
    $stmt = $conn->prepare('INSERT INTO users (name, email, password) VALUES (?, ?, ?)');
    if (!$stmt) {
        echo json_encode([
            'success' => false,
            'message' => 'Insert prepare failed. Check users table columns.',
            'error' => $conn->error,
        ]);
        return;
    }

    $stmt->bind_param('sss', $name, $email, $hash);
    if (!$stmt->execute()) {
        $stmt->close();
        echo json_encode(['success' => false, 'message' => 'Account creation failed.', 'error' => $conn->error]);
        return;
    }

    $newId = $stmt->insert_id;
    $stmt->close();

    echo json_encode([
        'success' => true,
        'message' => 'Account created successfully.',
        'user_id' => $newId,
    ]);
}

function login_user($conn) {
    $identifier = trim($_POST['username'] ?? '');
    $email = trim($_POST['email'] ?? '');
    $password = trim($_POST['password'] ?? '');

    $lookup = $identifier !== '' ? $identifier : $email;

    if ($lookup === '' || $password === '') {
        echo json_encode(['success' => false, 'message' => 'Missing login credentials.']);
        return;
    }

    $stmt = $conn->prepare('SELECT id, password FROM users WHERE email = ? OR name = ? LIMIT 1');
    if (!$stmt) {
        echo json_encode(['success' => false, 'message' => 'Login query failed.', 'error' => $conn->error]);
        return;
    }

    $stmt->bind_param('ss', $lookup, $lookup);
    $stmt->execute();
    $result = $stmt->get_result();
    $user = $result ? $result->fetch_assoc() : null;
    $stmt->close();

    if (!$user || !password_verify($password, $user['password'])) {
        echo json_encode(['success' => false, 'message' => 'Invalid email or password.']);
        return;
    }

    session_start();
    $_SESSION['user_id'] = (int) $user['id'];

    echo json_encode([
        'success' => true,
        'user_id' => (int) $user['id'],
    ]);
}

function all_users_email($conn) {
    $result = $conn->query('SELECT email FROM users');
    if (!$result) {
        echo json_encode(['success' => false, 'message' => 'Unable to fetch emails.', 'error' => $conn->error]);
        return;
    }

    echo json_encode(['success' => true, 'data' => $result->fetch_all(MYSQLI_ASSOC)]);
    $result->free();
}

function logout_user() {
    session_start();
    session_destroy();
    echo json_encode(['success' => true]);
}

function get_user_info($conn) {
    session_start();
    $user_id = $_POST['user_id'] ?? $_GET['user_id'] ?? $_SESSION['user_id'] ?? null;

    if (!$user_id) {
        echo json_encode(['success' => false, 'message' => 'No user ID provided.']);
        return;
    }

    $user_id = (int) $user_id;
    $stmt = $conn->prepare('SELECT name FROM users WHERE id = ? LIMIT 1');
    if (!$stmt) {
        echo json_encode(['success' => false, 'message' => 'User query failed.', 'error' => $conn->error]);
        return;
    }

    $stmt->bind_param('i', $user_id);
    $stmt->execute();
    $result = $stmt->get_result();
    $row = $result ? $result->fetch_assoc() : null;
    $stmt->close();

    if (!$row) {
        echo json_encode(['success' => false, 'message' => 'User not found.']);
        return;
    }

    echo json_encode(['success' => true, 'name' => $row['name']]);
}
?>
