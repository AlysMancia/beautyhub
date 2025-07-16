$(document).ready(function() {

    $('#carouselExampleAutoplaying').carousel({
        interval: 2000, 
        ride: 'carousel'
    });


    $('#carouselExampleAutoplaying').on('mouseenter', function() {
        $(this).carousel('pause');
    });

  
    $('#carouselExampleAutoplaying').on('mouseleave', function() {
        $(this).carousel('cycle');
    });

    $('.carousel-control-next').click(function() {
        $('#carouselExampleAutoplaying').carousel('next');
    });

    $('.carousel-control-prev').click(function() {
        $('#carouselExampleAutoplaying').carousel('prev');
    });
<<<<<<< HEAD

    session();
});

function session(){
    var user_id = $('#user_id').val();
    console.log(user_id);
    if (user_id > 0 ){
        $('.users_tab').addClass("hidden");
        $('.loginn').removeClass("hidden");

    }
}
var login_box = ''
$(document).on('click','.login_btn',function() {
    $('.jconfirm').remove();

    var title = `<div class="confirm_title"><h6><i class="fa-solid fa-circle-user"></i> Login to your account</h6></div>`;
    var login =`
        <div class="col-md-12 forms">
                    <div class="form-floating mb-3">
                        <input type="email" class="form-control username" id="floatingInput" placeholder="name@example.com">
                        <label for="floatingInput">Email or Username</label>
                    </div>
                    <div class="form-floating">
                        <input type="password" class="form-control password" id="floatingPassword" placeholder="Password">
                        <label for="floatingPassword">Password</label>
                    </div> 
                    <p class="signup_btn">Create account</p>
                    <button class="btn btn-primary user_login_btn">Login</button>
            </div>
    `
    login_box = $.dialog({
        title: title,
        content: login,
        columnClass: 'col-md-3',
        animation: 'bottom',
        closeAnimation: 'bottom',
        draggable:false,
        backgroundDismiss: true,
        onOpenBefore: function () {
            $('.jconfirm').trigger('close');
        }
    });
});
$(document).on('click','.signup_btn',function() {
    
    $('.jconfirm').remove();
    var title = `<div class="confirm_title"><h6><i class="fa-solid fa-circle-user"></i> Create Account</h6></div>`;
    var login =`<div class="col-md-12 forms">     
                    <div class="form-floating mb-3">
                        <input type="text" class="form-control su_fname" id="floatingInput" placeholder="name">
                        <label for="floatingInput">Firstname</label>
                    </div>
                    <div class="form-floating mb-3">
                        <input type="text" class="form-control su_lname" id="floatingInput" placeholder="name">
                        <label for="floatingInput">Lastname</label>
                    </div>
                    <div class="form-floating mb-3">
                        <input type="text" class="form-control su_username" id="floatingInput" placeholder="name">
                        <label for="floatingInput">Username</label>
                    </div>
                    <div class="form-floating mb-3">
                        <input type="email" class="form-control su_email" id="floatingInput" placeholder="name@example.com">
                        <label for="email_default floatingInput">Email</label>
                        <label class ="email_exist hidden" for="floatingInput">Email exist!</label>
                    </div>
                    <div class="form-floating">
                        <input type="password" class="form-control su_pword" id="floatingPassword" placeholder="Password">
                        <label for="floatingPassword">Password</label>
                    </div> 
                    <p class="login_btn">Have an account?</p>
                    <button type="button" class="btn btn-primary create_user_btn">Sign Up</button>
    </div>`
    let signupDialog = $.dialog({
        title: title,
        content: login,
        columnClass: 'col-md-4',
        animation: 'bottom',
        closeAnimation: 'bottom',
        backgroundDismiss:true,
        draggable:false,
        

    });
    
    $(document).on('click','.create_user_btn',function() {
        var Firstname = $('.su_fname').val().trim();
        var Lastname = $('.su_lname').val().trim();
        var username = $('.su_username').val().trim().toLowerCase();
        var email = $('.su_email').val().trim().toLowerCase();
        var password = $('.su_pword').val().trim();

        if (Firstname === '' || Lastname === '' || username === '' || email === '' || password === ''){
            Swal.fire({
                title: '',
                icon: 'error', 
                text: 'Please Fill up all fields',
                showConfirmButton: false,
                timer: 2000,
            });return false();
        }
        var emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        if (!emailPattern.test(email)) {
            Swal.fire({
                title: "Invalid Email!",
                icon: 'error',
                text: "",
                showConfirmButton: false,
                timer: 1000
            });
            return false;
        }
            $.ajax({
                url: "php/main.php", 
                type: "POST",
                data: { FunctionName:'create_user',
                    Firstname: Firstname,
                        Lastname: Lastname,
                        username:username,
                        email:email,
                        password:password,
                 },
                success: function(response) {
                    signupDialog.close();
                    Swal.fire({
                        title: "Account Created",
                        text: "You can now login",
                        imageUrl: "./Assets/success.jpg",
                        imageWidth: 400,
                        imageHeight: 200,
                        showConfirmButton: false,
                        imageAlt: "Custom image",
                        timer:2000,
                      });
        
                 
                   
                },
            });
    });
   
});

$(document).on('keyup', '.su_email', function(e) {
  var new_email = $(this).val();
  console.log(new_email);
    $.ajax({
        url: "php/main.php", 
        type: "POST",
        data:{FunctionName:'all_users_email'},
        success: function(response) {
            $('.su_email').css('border-color','');
            $('.email_exist').addClass("hidden")

            if (response.toLowerCase().includes(new_email.toLowerCase())) {
                $('.su_email').css('border-color', 'red');
                $('.email_exist').removeClass("hidden")
            }
            if (new_email === ''){
            $('.su_email').css('border-color','');
            $('.email_exist').addClass("hidden")
            }
        },
    });
}); 
$(document).on('click','.user_login_btn',function() {
    var username = $('.username').val().trim();
    var email = $('.username').val().trim();
    var password = $('.password').val().trim();


    $.ajax({
        url: "php/main.php", 
        type: "POST",
        data:{FunctionName:'login_user',
            username:username,
            email:email,
            password:password
        },
        success: function(response) {
            console.log(response)
        if (response > 0){
            $('#user_id').val(response);
            session();
            login_box.close();
        }else{
            Swal.fire({
                title: '',
                icon: 'error', 
                text: 'Incorrect username/password',
                showConfirmButton: false,
                timer: 2000,
            });return false();
        }

        },
    });
    return false;
});    
=======
});
>>>>>>> e290a40fdb79a73fc27f2943d9f68dbd9ec08db2
