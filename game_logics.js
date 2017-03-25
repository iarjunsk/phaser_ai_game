var w=800;
var h=400;
var game = new Phaser.Game(w, h, Phaser.CANVAS, 'phaser-game', { preload: preload, create: create, update: update, render: render });

function preload() {
    game.load.image('background', 'assets/game/background.png');

    game.load.spritesheet('player', 'assets/sprites/player.png',32 ,48);

    game.load.image('ufo', 'assets/game/ufo.png');
    game.load.image('bullet', 'assets/sprites/purple_ball.png');

    game.load.image('menu', 'assets/game/menu.png');

    game.load.audio('jump' ,      'assets/audio/jump.mp3' );
    game.load.audio('game_over' , 'assets/audio/game_over.wav' );
}

var player;
var bg;

var bullet;
var bullet_fired=false;
var ufo;

var jumpButton;

var menu;

var bullet_speed;
var bullet_displacement;
var stay_on_air;
var stay_on_floor;

//NN
var nn_network;
var nn_trainer;
var nn_output;
var trainingData=[];

var auto_mode = false;
var training_complete=false;

// Sound
var soundGameOver;
var soundJump;

function create() {

    // Setting game object's property
    game.physics.startSystem(Phaser.Physics.ARCADE);
    game.physics.arcade.gravity.y = 800;
    game.time.desiredFps = 30;

    // Adding game objects
    bg = game.add.tileSprite(0, 0, w, h, 'background');
    ufo = game.add.sprite(w-100, h-70, 'ufo');
    bullet = game.add.sprite(w-100, h, 'bullet');
    player = game.add.sprite(50, h, 'player');


    // Setting player object's property
    game.physics.enable(player);
    player.body.collideWorldBounds = true;
    var run = player.animations.add('run');
    player.animations.play('run', 10, true);

    // Setting bullet object's property
    game.physics.enable(bullet);
    bullet.body.collideWorldBounds = true;

    // Pause Functions
    pause_label = game.add.text(w - 100, 20, 'Pause', { font: '20px Arial', fill: '#fff' });
    pause_label.inputEnabled = true;
    pause_label.events.onInputUp.add(pause, self);
    game.input.onDown.add(un_pause, self);

    jumpButton = game.input.keyboard.addKey(Phaser.Keyboard.SPACEBAR);

    // Neural Network
    nn_network =  new synaptic.Architect.Perceptron(2, 6, 6, 2);
    nn_trainer = new synaptic.Trainer(nn_network); // Create trainer

    //Sound
    soundJump  = game.add.audio('jump');
    soundGameOver=game.add.audio('game_over');

}

function train_nn(){

    nn_trainer.train(trainingData, {
        rate: 0.0003,
        iterations: 10000,
        shuffle: true
    });

}

function get_op_from_trainedData(input_param){

    //console.log("INPUT",input_param[0]+" "+input_param[1]);
    nn_output = nn_network.activate(input_param);
    var on_air=Math.round( nn_output[0]*100 );
    var on_floor=Math.round( nn_output[1]*100 );
    console.log("Forecast ","ON AIR %: "+ on_air + " ON FLOOR %: " + on_floor );
    return nn_output[0]>=nn_output[1];
}

function pause(){
    game.paused = true;
    game.sound.mute = false;
    menu = game.add.sprite(w/2,h/2, 'menu');
    menu.anchor.setTo(0.5, 0.5);
}

function un_pause(event){
    if(game.paused){
        // Calculate the corners of the menu
        var menu_x1 = w/2 - 270/2, menu_x2 = w/2 + 270/2,
            menu_y1 = h/2 - 180/2, menu_y2 = h/2 + 180/2;

        var mouse_x = event.x  ,
            mouse_y = event.y  ;

        if(mouse_x > menu_x1 && mouse_x < menu_x2 && mouse_y > menu_y1 && mouse_y < menu_y2 ){

            if(mouse_x >=menu_x1 && mouse_x <=menu_x2 && mouse_y >=menu_y1 && mouse_y <=menu_y1+90){
                training_complete=false;
                trainingData = [];
                auto_mode = false;
            }else if (mouse_x >=menu_x1 && mouse_x <=menu_x2 && mouse_y >=menu_y1+90 && mouse_y <=menu_y2) {
                if(!training_complete) {
                    console.log("","Training using Data set of "+ trainingData.length +" elements" );
                    train_nn();
                    training_complete=true;
                }
                auto_mode = true;
            }

            menu.destroy();
            reset_state_variables();
            game.paused = false;

        }
    }
}


function reset_state_variables(){

    player.body.velocity.x=0;
    player.body.velocity.y=0;
    bullet.body.velocity.x = 0;

    bullet.position.x = w-100;
    player.position.x=50;

    bullet_fired=false;

}

function jump(){
    soundJump.play();
    player.body.velocity.y = -270;
}

function update() {

    bg.tilePosition.x -= 1; //moving background

    game.physics.arcade.collide(bullet, player, collisionHandler, null, this);

    stay_on_floor=1;
    stay_on_air = 0;

    if(!player.body.onFloor()) {
        stay_on_floor = 0;
        stay_on_air = 1;
    }

    bullet_displacement = Math.floor( player.position.x - bullet.position.x );

    // Manual Jump
    if( auto_mode==false          &&
        jumpButton.isDown         &&
        player.body.onFloor()     ){
        jump();
    }

    // Auto Jump
    if( auto_mode==true           &&
        bullet.position.x>0       &&
        player.body.onFloor()     ){

        if( get_op_from_trainedData( [bullet_displacement , bullet_speed] )  ){
            jump();
        }
    }

    // Repeated Fire
    if( bullet_fired==false ){
        fire();
    }

    //Reload bullet
    if( bullet.position.x <= 0  ){
        reset_state_variables();
    }

    // Collecting Training Set
    if( auto_mode==false      &&
        bullet.position.x > 0 ){

        trainingData.push({
                'input' :  [bullet_displacement , bullet_speed],
                'output':  [stay_on_air , stay_on_floor ]  // jump now , stay on floor
        });

        console.log("BULLET DISPLACEMENT, BULLET SPEED, Stay on Air?, Stay on Floor?: ",
            bullet_displacement + " " +bullet_speed + " "+
            stay_on_air+" "+  stay_on_floor
        );

    }


}

function fire(){
    bullet_speed =  -1 * getRandomSpeed(300,800);
    bullet.body.velocity.y = 0 ;
    bullet.body.velocity.x = bullet_speed ;
    bullet_fired=true;
}

function collisionHandler(){
    soundGameOver.play();
    pause();
}

function getRandomSpeed(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function render () {

}
