<?php
$conn = new mysqli("localhost", "root", "", "beautyhub");
$_SESSION = '';
call_function($_POST);

function call_function (){
    // echo 'Function Name = ' . $_POST['FunctionName'];
    switch ($_POST['FunctionName']) {
        case 'create_user':
            create_user($_POST);
        break;
        case 'login_user':
            login_user($_POST);
        break;
        case 'logout_user':
            logout_user($_POST);
        break;
        case 'all_users_email':
            all_users_email($_POST);
        break;
        
        default:
            # code...
            break;
    }
}

function create_user () {
    global $conn;

    // echo json_encode('success');

    $stmt = $conn->prepare("INSERT INTO `users` (`username`, `email`, `Firstname`, `Lastname`, `Password`) VALUES ('".$_POST['username']."','".$_POST['email']."' , '".$_POST['Firstname']."', '".$_POST['Lastname']."', '".$_POST['password']."');");
    echo json_encode("INSERT INTO `users` (`username`, `email`, `Firstname`, `Lastname`, `Password`) VALUES ('".$_POST['username']."','".$_POST['email']."' , '".$_POST['Firstname']."', '".$_POST['Lastname']."', '".$_POST['password']."');");
    $stmt->execute();
    $stmt->close();
    $conn->close();
}
function all_users_email() {
    global $conn;

    $result = $conn->query("SELECT email FROM users");
    echo json_encode($result->fetch_all(MYSQLI_ASSOC));

    $result->free(); 
}
function login_user () {
    global $conn;
    $username = $_POST['username'];
    $email = $_POST['email'];
    $password = $_POST['password'];



        $stmt = $conn->prepare("SELECT * FROM users WHERE (username = ? OR email = ?) AND password = ? ");
        $stmt->bind_param("sss", $username, $email, $password);
        $stmt->execute();
        $result = $stmt->get_result();
        $user = $result->fetch_assoc();
    if ($user['user_id'] > 0) {
        session_start();
        $_SESSION['user_id'] = $user['user_id'];
        
    } else {
echo "Invalid username, email, or password.";
    }
    echo json_encode($_SESSION['user_id']);

    $stmt->close();
    $conn->close();
}
function logout_user(){
    session_start();
    session_destroy();
    echo json_encode(["success" => true]);
    exit();
}
?>