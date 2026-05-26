<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreatePerUserBrandTable extends Migration
{
    public function up()
    {
        Schema::create('per_user_brand', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->unsignedBigInteger('user_id');
            $table->unsignedBigInteger('brand_id');
            $table->timestamps();
        });
    }

    public function down()
    {
        Schema::dropIfExists('per_user_brand');
    }
}
