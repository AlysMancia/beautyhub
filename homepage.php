<!DOCTYPE html> 
<html lang="en">
<head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta charset="UTF-8">
  <!-- Bootstrap CSS -->
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet" crossorigin="anonymous">

<!-- Google Fonts -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair:ital,opsz,wght@0,5..1200,300..900;1,5..1200,300..900&display=swap" rel="stylesheet">

<!-- Font Awesome -->
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">

<!-- Custom CSS -->
<link rel="stylesheet" href="style.css">

<!-- jQuery (load first) -->
<script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>

<!-- jQuery Confirm -->
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/jquery-confirm/3.3.4/jquery-confirm.min.css">
<script src="https://cdnjs.cloudflare.com/ajax/libs/jquery-confirm/3.3.4/jquery-confirm.min.js"></script>

<!-- SweetAlert2 -->
<script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>

<!-- Bootstrap JS (load last) -->
<script src="https://cdn.jsdelivr.net/npm/@popperjs/core@2.11.6/dist/umd/popper.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.min.js"></script>

<!-- Custom JS -->
<script src="script.js"></script>
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
</head>
<title> AZNCOLLECTION</title>
<body>
  
<input type="text" id ="user_id" class ="hidden" value="<?php echo $user_id; ?>">
<!---search button-->
<header class="nav_sticky sticky-top">
<nav>
    <div class="container-fluid nav_container">  
      <form class="form-inline search_container">
        <input class="form-control mr-sm-3" type="search" placeholder="Search" aria-label="Search">
        <button class="btn btn-outline-success my-2 my-sm-0" type="submit">Search</button>
      </form>

        <div class="list">
            <ul>
              <li><a href="">Skincare Sets</a></li>
              <li><a href=""> Soap</a></li>
              <li><a href="">Sunscreen</a></li>
              <li><a href="">Moisturizer</a></li>
              <li><a href="">Toner</a></li>
              <li><a href="">Lotion</a></li>
              <li><a href="">Facial Wash</a></li>
              <li><a href="">Lip products</a></li>
              <li><a href="">Perfumes</a></li>
              <li><a href="">Brands</a></li>
            </ul>
        </div>
    
        <div class="users_tab">
          <i class="fa-solid fa-user"></i>
          <a href="#" class="login_btn">Login</a> <span>|</span>
          <a href="#" class="signup_btn">Sign Up</a>
        </div>

        <div class="loginn hidden">
          <div class="dropdown login_dropdown">
              <button class="btn btn-secondary dropdown-toggle" type="button" id="dropdownMenu2" data-bs-toggle="dropdown" aria-expanded="false">
              <span>
                <i class="fa-solid fa-circle-user user_logo"></i>
              </span>
              <h6 id="user_greeting"></h6>
              </button>
              <ul class="dropdown-menu" aria-labelledby="dropdownMenu2">
                <li><a class="dropdown-item" href ="pages/dashboard.php" type="button">Dashboard</a></li>
                <li><button class="dropdown-item logout_btn" type="button">Logout</button></li>
              </ul>
            </div>
        </div>    
    </div>  
</nav>  
</header>

<section id="carousel-con" class="section">
<div class="courousel">
  <div id="carouselExampleAutoplaying" class="carousel slide" data-bs-ride="carousel">
    <div class="carousel-inner">
      <div class="carousel-item active">
        <img src="Assets/ryx.jpg" class="d-block w-100" alt="ryx">
      </div>
      <div class="carousel-item">
        <img src="Assets/vita.png" class="d-block w-100" alt="vb">
      </div>
      <div class="carousel-item">
        <img src="Assets/fs.jpg" class="d-block w-100" alt="fsk">
      </div>
    </div>
    <button class="carousel-control-prev" type="button" data-bs-target="#carouselExampleAutoplaying" data-bs-slide="prev">
      <span class="carousel-control-prev-icon" aria-hidden="true"></span>
      <span class="visually-hidden">Previous</span>
    </button>
    <button class="carousel-control-next" type="button" data-bs-target="#carouselExampleAutoplaying" data-bs-slide="next">
      <span class="carousel-control-next-icon" aria-hidden="true"></span>
      <span class="visually-hidden">Next</span>
    </button>
  </div>
</div>
</section>


<section id="sec" class="section">
  <div class="cont2">
    <div class="wsip">
        <h3 class="Why">Why is Sunscreen important?</h3>
        <p class="Learn">Learn Sunscreen's benefits you might miss!</p>
    </div>
  </div>  

  <div class="benefits">
    <div class="uv">
      <img src="Assets/sun-protection.png" alt="sunpro" class="uvb" style="margin-left: 18%;">
      <h6>Avoids UV Ray</h6>
      <p>wearing sunscreen protects you from harmful uv ray from the sun that can cause skin cancer</p>
    </div>

  <div class="uv">
    <img src="Assets/skinhealth.png" alt="sunpro" class="uvb" style="margin-left: 18%;">
    <h6>Increase skin health</h6>
    <p>Maintains skin health by protecing against sun's harmful ultraviolet rays</p>
  </div>
  <div class="uv">
    <img src="Assets/aging.png" alt="sunpro" class="uvb"style="margin-left: 16%; ">
    <h6 >Prevents skin aging</h6>
    <p>Prevents aging including wrinkles,brown spots and irregular pigmentation</p>
  </div>

    <div class="uv">
      <img src="Assets/allergy.png" alt="sunpro" class="uvb"style="margin-left: 18%;">
      <h6>Protects against sun allergy</h6>
      <p>Regular application can reduce risk cause by UVB and UVA</p>
    </div>
      <div class="uv">
        <img src="Assets/healthcare.png" alt="sunpro" class="uvb"style="margin-left: 18%;">
        <h6>Improve Overall Health</h6>
        <p>Whiteblood cells alterations cause by UV rays can weaken our immune system up to 24hrs after sun exposure</p>
      </div>
  </div>
  <!-- <hr class="solid" id="sunline"></hr> -->
</section>

<section id="reco" class="section">
  <div class="love">
    <img src="Assets/heart.gif" alt="puso">
    <h3>Product Recommendation that you might love!</h3>
    <p >Seller picks products that has positive reviews from different users!</p>
</div>
<div class="slidercon-container"></div>
<div class="slider-container">
    <input type="radio" name="slide" id="c1" class="square"checked>
    <label for="c1" class="card">
      <div class="row">
        <div class="icon">1</div>
    <div class="description">
      <h4>Rejuvenating set</h4>
      <p>Ryxskin Glowbomb</p>
    </div>
  </div>
</div>
</label>
<div class="slider-container">
<input type="radio" name="slide" id="c2" checked>
<label for="c2" class="card">
  <div class="row">
    <div class="icon">2</div>
<div class="description">
  <h4>Lotion</h4>
  <p>Ryxskin Beauty Lotion</p>
</div>
</div>
</div>
</div>
</label>
<div class="slider-container">
<input type="radio" name="slide" id="c3" checked>
    <label for="c3" class="card">
      <div class="row">
        <div class="icon">3</div>
    <div class="description">
      <h4>Sunscreen</h4>
      <p>Fairyskin Sunscreen SPF30++++</p>
    </div>
  </div>
</div>
</label>
<div class="slider-container">
<input type="radio" name="slide" id="c4" checked>
    <label for="c4" class="card">
      <div class="row">
        <div class="icon">4</div>
    <div class="description">
      <h4>Body Bar Soap</h4>
      <p>G21 Kojic Honey Oatmeal</p>
    </div>
  </div>
</div>
</label>
<div class="slider-container">
  <input type="radio" name="slide" id="c5"checked>
      <label for="c5" class="card">
        <div class="row">
          <div class="icon">5</div>
      <div class="description">
        <h4>Moisturizer</h4>
        <p>Zeevo Cloud Hydrator</p>
      </div>
    </div>
  </div>
  </label>
</section>


<section id="shopbrand" class="section">
<div class="brands-con">
  <div class="brands-sec">
<h3>SHOP BY BRANDS</h3>
<p>Discover a selection of cult-favorite brands that's on our radar</p>
<div class="logo-container">
  <div class="logo" >
    <a href="#">
  <img src="Assets/ryxlogo.jpg " alt="lryx">
</a>
  </div>
  <div class="logo" >
    <a href="#">
    <img src="Assets/jskin.png" alt="ljs">
  </a>
    </div>
    <div class="logo" >
      <a href="#">
      <img src="Assets/babe.png" alt="lbabe">
    </a>
      </div>
      <div class="logo" >
        <a href="#">
        <img src="Assets/bs.png" alt="lbs">
      </a>
        </div>
        <div class="logo" >
          <a href="#">
          <img src="Assets/fairy.png" alt="lfs">
        </a>
          </div>
          <div class="logo" >
            <a href="#">
            <img src="Assets/g21logo.jpg" alt="lg21">
          </a>
            </div>

</div>
<div class="logo-container">
  <a href="#">
  <div class="logo" >
  <img src="Assets/glulipo.png " alt="lgl">
</a>
  </div>
  <div class="logo" >
    <a href="#">
    <img src="Assets/kelly.png" alt="lkelly">
  </a>
    </div>
    <div class="logo" >
      <a href="#">
      <img src="Assets/VITABEARS.png" alt="lvb">
    </a>
      </div>
      <div class="logo" >
        <a href="#">
        <img src="Assets/ygbabe.png" alt="lyg">
      </a>
        </div>
        <div class="logo" >
          <a href="#">
          <img src="Assets/ZEEVO.png" alt="lzeevo">
        </a>
          </div>
          <div class="logo" >
            <a href="#">
            <img src="Assets/sd.png" alt="lsd">
          </a>
            </div>

</div>
</div>
</div>
</section>
</body>
</html>
 <script>
  $(document).on('click','.logout_btn',function() {
    console.log("logout")
    
    $.ajax({
        url: "php/main.php", 
        type: "POST",
        data:{FunctionName:'logout_user'},
        success: function(response) {
          setTimeout(() => {
            window.location.href = "homepage.php";
          },1500);
        },
    });
}); 

</script> 