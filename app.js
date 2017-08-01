
var express = require('express');
var app = express();
var serv = require('http').Server(app);

app.get('/',function(req, res){
	res.sendFile(__dirname + '/client/index.html');
});
app.use('/client',express.static(__dirname + '/client'));


// Create a server and listen on port 3000. Any request to server must match '/' or '/client', 
// meaning that the private server files are not accessible. 
serv.listen(3000);
console.log("Server Started");

var SOCKET_LIST = {};


var Entity = function(){
	var self = {
		x:500,
		y:400,
		velX:0,
		velY:0,
		id:"",
	}
	self.update = function(){
		self.updatePosition();
		
	}
	self.updatePosition = function(){
		self.x += self.velX;
		self.y += self.velY;	
	} 
	return self;
}

var Player = function(id){
	var self = Entity();
	self.id = id;
	self.number = "" + Math.floor(10 * Math.random()),
	self.pressingUp = false;
	self.pressingDown = false;
	self.pressingLeft = false;
	self.pressingRight = false;
	self.pressingShoot = false;
	self.mouseAngle = 0;
	self.maxVel = 5;
	self.shootCooldown = -1;

	var super_update = self.update;
	self.update = function(){	
		self.updateVel();
		super_update();	
		
	
		if(self.pressingShoot && self.shootCooldown < 0){	
			self.shootBullet(self.mouseAngle);			
			self.shootCooldown = 25;
		}
		self.shootCooldown--;
		
	}
	self.shootBullet = function(angle){
		var b = Bullet(angle);
		b.x = self.x;	
		b.y = self.y;
	}


	self.updateVel = function(){
		if(self.pressingUp)
			self.velY = -self.maxVel;
		else if(self.pressingDown)
			self.velY = self.maxVel;
		else
			self.velY = 0;

		if(self.pressingLeft)
			self.velX = -self.maxVel;
		else if(self.pressingRight)
			self.velX = self.maxVel;
		else 
			self.velX = 0;
	}
	Player.list[id] = self;
	return self;
}
Player.list = {};
Player.onConnect = function(socket){
	var player = Player(socket.id);
	console.log("Player connected "+ player.id);

	socket.on("keyPress",function(data){		
		if(data.inputId === "up")
			player.pressingUp = data.state;
		else if(data.inputId === "down")
			player.pressingDown = data.state;
		else if(data.inputId === "left")
			player.pressingLeft = data.state;
		else if(data.inputId === "right")
			player.pressingRight = data.state;		
		else if(data.inputId === "shoot")
			player.pressingShoot = data.state;
		else if(data.inputId === "mouseAngle")
			player.mouseAngle = data.state;
	});

}
Player.onDisconnect = function(socket){
	delete Player.list[socket.id];
}
Player.update = function(){
	var pack = [];	
	for(var i in Player.list){
		var player = Player.list[i];
		//console.log("Updating player: " + player.number);
		player.update();
		pack.push({
			x:player.x,
			y:player.y,
			number:player.number
		});
	}
	return pack;
}


var Bullet = function(angle){
	var self = Entity();
	self.id = Math.random();
	self.velX = 3 * Math.cos(angle * (Math.PI/180));//Math.cos(angle * (Math.PI/180))*10; 
	self.velY = 3 * Math.sin(angle *(Math.PI/180));//Math.sin(angle * (Math.PI/180))*10;
	console.log("Angle: " + angle + " velX: " + self.velX + " velY: " + self.velY);


	var super_update = self.update;
	self.update = function(){	
		super_update();
	}
	Bullet.list[self.id] = self;
	return self;
}
Bullet.list = {};

Bullet.update = function(){
	var pack = [];	
	for(var i in Bullet.list){
		var bullet = Bullet.list[i];
		//console.log("Updating player: " + player.number);
		bullet.update();
		pack.push({
			x:bullet.x,
			y:bullet.y,		
		});
	}
	return pack;
}

var DEBUG = true;

// Handle connections
var io = require('socket.io')(serv,{});
io.sockets.on('connection', function(socket){
	socket.id = Math.random();
	SOCKET_LIST[socket.id] = socket;
	
	Player.onConnect(socket);

	socket.on("disconnect",function(){
		delete SOCKET_LIST[socket.id];
		Player.onDisconnect(socket);
	});

	socket.on("sendMsgToServer",function(data){
		var playerName = ("" + socket.id).slice(2,7);
		for( var i in SOCKET_LIST){
			SOCKET_LIST[i].emit("addToChat",playerName + ": " + data);
		}
	});

	socket.on("evalServer",function(data){
		if(!DEBUG){
			return;
		}
		var res = eval(data);
		socket.emit("evalAnswer",res);
	});

});

// Game loop
setInterval(function(){
	var pack = {
		player:Player.update(),
		bullet:Bullet.update(),
	}
	

	for(var i in SOCKET_LIST){
		var socket = SOCKET_LIST[i];
		socket.emit("newPosition", pack);
	}	
},10);
