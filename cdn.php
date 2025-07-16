<!-- Inside cdn.html -->

<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" 
integrity="sha512-iecdLmaskl7CVkqkXNQ/ZH/XLlvWZOJyj7Yy7tcenmpD1ypASozpmT/E0iPtmFIB46ZmdtAc9eNBvH0H/ZpiBw==" 
crossorigin="anonymous" referrerpolicy="no-referrer" />
 <!-- Bootstrap CSS -->


<script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>
<script>let $user_id = '';</script>

<?php
session_start();
header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
header("Pragma: no-cache");

if (!isset($_SESSION['user_id'])) {
  $user_id = 0;
  ?><script>
    session();
    console.log($user_id )
  </script>
    <?php
}else{
  $user_id = $_SESSION['user_id'];
  ?><script>
    console.log($user_id + ' else')
  </script>
    <?php
}
?>
<input type="text" id ="user_id" class ="hidden" value="<?php echo $user_id; ?>">
<script>
    var session_id = '';
    $(document).ready(function() {
        session_id = localStorage.getItem('user_id');
        var username ='';
        console.log(session_id);

        $.ajax({
            type: 'POST',
           url: "../php/main.php", 
            data: { 
                FunctionName:'get_user_info',
                session_id:session_id},
            success: function(response) {
                    var data = JSON.parse(response);
                    username = data.username;
                    localStorage.setItem('username', username);
                    
            }
        });

    });
</script>
<style>
    html , body{
    font-family:'Trebuchet MS', 'Lucida Sans Unicode', 'Lucida Grande', 'Lucida Sans', Arial, sans-serif;
    scroll-behavior: smooth;
    scroll-snap-type: y mandatory; 
    


}
</style>