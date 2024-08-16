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
});