
var express = require('express');
var app = express();
var serv = require('http').Server(app);
var profiler = require('v8-profiler');
var fs = require('fs');

app.get('/',function(req, res){
	res.sendFile(__dirname + '/client/index.html');
});
app.use('/client',express.static(__dirname + '/client'));

serv.listen(3000);
console.log("Server Started");

var SOCKET_LIST = {};


var Entity = function(){
	var self = {
		x:0,
		y:0,
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
	self.getDistance = function(pt){
		var a = self.x - pt.x;
		var b = self.y - pt.y;
		return Math.sqrt(a*a + b*b);
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
	self.cooldown = -1;
	self.maxVel = 3;
	self.hp = 2;
	self.hpMax = 2;
	self.score = 0;


	var super_update = self.update;
	self.update = function(){	
		self.updateVel();
		super_update();	
		

		if(self.pressingShoot && self.cooldown < 0){	
			self.shootBullet(self.mouseAngle);	
			self.cooldown = 25;			
		}
		self.cooldown--;
	}
	self.shootBullet = function(angle){		
		var b = Bullet(self.id, angle);
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


	self.getInitPack = function(){ 
		return{
			id:self.id,
			x:self.x,
			y:self.y,
			number:self.number,
			hp:self.hp,
			hpMax:self.hpMax,
			score:self.score,
		}
	}

	self.getUpdatePack = function(){ 
		return{
			id:self.id,
			x:self.x,
			y:self.y,	
			hp:self.hp,			
			score:self.score,	
		}
	}

	// Add player to Player.list and init package
	Player.list[id] = self;
	initPack.player.push(self.getInitPack());

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


	socket.emit("init", {
		selfId:socket.id,
		player:Player.getAllInitPack(),
		bullet:Bullet.getAllInitPack(),
	});
}

Player.getAllInitPack = function(){
	var players = [];
	for(var i in Player.list){
		players.push(Player.list[i].getInitPack());
	}
	return players;
}

Player.onDisconnect = function(socket){
	delete Player.list[socket.id];
	removePack.player.push(socket.id);
}
Player.update = function(){
	var pack = [];	
	for(var i in Player.list){
		var player = Player.list[i];
		player.update();
		pack.push(player.getUpdatePack()); 
	}
	return pack;
}


var Bullet = function(parent, angle){
	var self = Entity();
	self.id = Math.random();
	self.velX = 5 * Math.cos(angle * (Math.PI/180));
	self.velY = 5 * Math.sin(angle *(Math.PI/180));
	self.parent = parent;
	self.toRemove = false;

	var super_update = self.update;
	self.update = function(){	
		super_update();


		// Check if bullet is hitting another player. If it is,
		// destroy the bullet, add score to shooter, reduce health 
		// of hit player.
		for(var i in Player.list){
			var p = Player.list[i];
			if(self.getDistance(p) < 45 && self.parent !== p.id){ // Fix
				self.toRemove = true;
				p.hp--;
				var shooter = Player.list[self.parent];
				if(shooter){ // In case shooter disconnects before bullet hits
					shooter.score += 50; // Enemy hit score bonus
				}
				if(p.hp <= 0){
					shooter.score += 100; // Enemy kill score bonus					
					p.x = Math.random() * 400 +50;
					p.y = Math.random() * 400 +50;
					p.hp = p.hpMax;				
				}
				
			}
		}
	}
	
	self.getInitPack = function(){
		return{
			id:self.id,
			x:self.x,
			y:self.y,
		}
	}

	self.getUpdatePack = function(){ 
		return{
			id:self.id,
			x:self.x,
			y:self.y,
		}
	}	
	Bullet.list[self.id] = self;
	initPack.bullet.push(self.getInitPack()); 

	return self;
}
Bullet.list = {};

Bullet.update = function(){
	var pack = [];	
	for(var i in Bullet.list){
		var bullet = Bullet.list[i];
		bullet.update();
		if(bullet.toRemove){
			delete Bullet.list[i];
			removePack.bullet.push(bullet.id);
		}else{
			pack.push(bullet.getUpdatePack()); 
		}
	}
	return pack;
}

Bullet.getAllInitPack = function(){	
	var bullets = [];
	for(var i in Bullet.list){
		bullets.push(Bullet.list[i].getInitPack());
	}
	return bullets;
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

//// Game loop
var initPack = {player:[],bullet:[]};
var removePack = {player:[],bullet:[]};

setInterval(function(){
	var updatePack = {
		player:Player.update(),
		bullet:Bullet.update(),
	}

	for(var i in SOCKET_LIST){
		var socket = SOCKET_LIST[i];
		socket.emit("init",initPack);		
		socket.emit("update", updatePack);
		socket.emit("remove",removePack);
	}	
	initPack.player = [];
	initPack.bullet = [];
	removePack.player = [];
	removePack.bullet = [];

},10);


var startProfiling = function(duration){
	profiler.startProfiling('1');

	setTimeout(function(){
		var profile1 = profiler.stopProfiling('1');

		profile1.export(function(error, result){
			fs.writeFile('./profile.cpuprofile', result);
			profile1.delete();
			console.log("Profile saved.");			
		});
	}, duration);
}
//startProfiling(10000);