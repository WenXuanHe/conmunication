const socket = require('socket.io');
const getLocation = require('./location');
const redis = require("redis");
const redisClient = redis.createClient();
const RedisServer = require('./redis_server');
const redisServer =  new RedisServer(redisClient);

class Chat{
                      
    constructor(){
        /////系统默认赋予一个编号
        this.guestNumber = 1;
        ////以socketID代表一个客户端，映射客户端信息
        this.socketInfo = {};
        ////在房间内的用户
        this.nameused = [];
        ////所有客户端peerId信息
        this.peerIDInfo = {};

        this.chatMessageInfo = {
            '房间1':[
                {
                    userName:'',
                    msg:''
                }
            ]
        };
        ////房间列表
        this.roomListInfo={};
        ////已连接人数
        this.connectedLength = 0;
        //websocket连接的上限数，超过了就用P2P技术
        this.MAX_CLIENT = 3;
        ////当前remoteAdress
        this.remoteAdress = '';

        this.ctx = null;

        this.pushRoomListToRedisAsync = async function(){
            return await redisServer.pushRoomListToRedis(...arguments);
        }
        this.setSocketInfoToRedisAsync = async function(id, socketInfoMap){
            let socketInfo = [...socketInfoMap].join(',').split(',');
            return await redisServer.setSocketInfoToRedis(id, ...socketInfo);
        }
        this.setSocketInfoSingleToRedisAsync = async function(){
            return await redisServer.setSocketInfoSingleToRedis(...arguments);
        }

        this.removeSocketInfoByIdAsync = async function(){
            return await redisServer.removeSocketInfoById(...arguments);
        }
    }

    buildMsg(userName, msg){
        return {
            userName,
            msg
        }
    }
    // /分配姓名
    assignGuessName(socket){
        //先判断有没有cookie

        let SOCKETID = this.ctx && this.ctx.cookies.get('SOCKETID'), name;
        if(!SOCKETID || !this.socketInfo[SOCKETID]){
            name = "访客"+ this.guestNumber;
            //用map结构代替object结构
            var socketInfoMap = new Map();
            socketInfoMap.set('name', name);
            socketInfoMap.set('room', '');
            socketInfoMap.set('peerID', '');
            socketInfoMap.set('locationInfo', {});

            var result = this.setSocketInfoToRedisAsync(socket.id, socketInfoMap);
            if(result){
                this.socketInfo[socket.id] = map;
            }
            
            socket.emit('SOCKETID', socket.id);
            ++this.guestNumber;
        }else{
            socket.id = SOCKETID;
            name = this.socketInfo[SOCKETID].get('name');
        }

        ////服务器传递给用户的信息 todo
        socket.emit("nameResult", socketInfoMap);

        return this.guestNumber;
    }

    clientDisconnect(client){
        let _self = this;
        client.on("disconnect", function(){
            // let nameIndex = _self.nameused.indexOf(_self.socketInfo[client.id].name);///可用于数组找位置
            // delete _self.nameused[nameIndex];
            // delete _self.socketInfo[client.id];
        });
    }

    joinRoom(socket, roomName, io){
        socket.join(roomName);
        
        //以房间为基本单元储存聊天信息
        this.chatMessageInfo[roomName] = [];
        let users = this.socketInfo[socket.id];

        try{
            let result = this.setSocketInfoSingleToRedisAsync(socket.id, 'room', roomName);
            if(result){
                users.set('room', roomName);
            }
        }catch(e){
            console.error(e);
        }
        
        if(!this.roomListInfo[roomName]){
            //无房间创建房间
            try{
                 let result = this.pushRoomListToRedisAsync(roomName);
                 if(result){
                    this.roomListInfo[roomName] = [];
                 }
            } catch(e){
                console.error(e);
            }
        }

        //将当前用户加到房间
        try{
            let res = this.setSocketInfoToRedisAsync(socket.id, users);
            if(res){
                this.roomListInfo[roomName].push(users);
            }
        }catch(e){
            console.error(e);
        }
        
        /////让用户知道自己进入了房间
        let msgInfo = this.buildMsg(users.get('name'), `${users.get('name')} 加入了${roomName}`);
        socket.emit("join", msgInfo);
        
        this.chatMessageInfo[roomName].push(msgInfo);

        //通知房间列表信息
        io.sockets.emit('roomList', this.getRoomList());
        /////让此房间的其他人知道有用户进入了房间
        socket.broadcast.to(roomName).emit("message", {
            text:this.socketInfo[socket.id].get('name')+"has joined this room"
        });
    }

    createRoom(socket, io){
        //创建新的房间
        socket.on("createRoom", (obj) => {
            let oldRoom = this.socketInfo[socket.id].get('room');
            //离开之前的房间
            this.leaveRoom(socket, oldRoom);
            //加入新房间，更新房间信息
            this.joinRoom(socket, obj.newRoomName, io);
            // //todo  还要存redis
            // this.roomListInfo[obj.newRoomName] = [this.socketInfo[socket.id]];
            // this.socketInfo[socket.id].set('room',  obj.newRoomName);

        });
    }

    joinNewRoom(socket, io){
        socket.on("joinRoom", (obj) => {

            this.leaveRoom(socket, this.socketInfo[socket.id].get('room'));

            this.joinRoom(socket, obj.RoomName, io);
        });
    }

    leaveRoom(socket, roomName){

        socket.leave(roomName);
        let users = this.socketInfo[socket.id];
        try{
            let res = redisServer.removeSocketInfoByIdAsync(roomName, socket.id);
            if(res){
                let socketList = this.roomListInfo[roomName];
                let index = roomList.indexOf(users);
                socketList.splice(index, 1);  
            }
        }catch(e){
            console.error('leaveRoom error:');
            console.error(e);
        }

        let msgInfo = this.buildMsg(users.get('name'), `${users.get('name')}  已离开房间`);
        socket.broadcast.to(roomName).emit('message', msgInfo);
        this.chatMessageInfo[roomName].push(msgInfo);
    }

    handleMassageToAll(socket){
        socket.on("message", (message) => {
            
            if(message.text !=="" ){
                //让自己知道自己发的信息
                let users = this.socketInfo[socket.id];
                let text = `${users.get('name')} : ${message.text}`;
                let msgInfo = this.buildMsg(users.get('name'), text);

                socket.emit("message", msgInfo);
                this.chatMessageInfo[roomName].push(msgInfo);
                socket.broadcast.to(this.socketInfo[socket.id].get('room')).emit("message", msgInfo);
            }
        });
    }

    changeName(socket){
        socket.on("changeName", (newName) => {
            let users = this.socketInfo[socket.id];
            let oldName = users.get('name');
            users.set('name', newName);
            let msgInfo = this.buildMsg(newName, `your new name is ${newName}`);
            /////让用户知道自己改了名字
            this.chatMessageInfo[roomName].push(msgInfo);
            socket.emit("ChangeNameResult", msgInfo);
            socket.broadcast.to(this.socketInfo[socket.id].get('room')).emit("message", {
                msg:`${oldName} rename success, new name is ${newName}`
            });
        });
    }

    hander(socket, req){
        socket.on('hander', (msg)=>{
            this.socketInfo[socket.id].set('peerID', msg.peerID);
            //超过最大人数，用P2P连接
            let locationInfo = getLocation(this.remoteAdress);
            this.socketInfo[socket.id].set('locationInfo', locationInfo);
        });
    }

    middleWear(app){
        app.use(async (ctx, next) => {

            this.remoteAdress = ctx.req.connection.remoteAddress;
            this.ctx = ctx;
            next();
        });
    }

    getRoomList(){
        return Object.keys(this.roomListInfo);
    }

    listen(server, app){
        var io = socket(server);
        this.middleWear(app);
        io.on('connection', async (client) => {
            // this.connectedLength++;
            //连接发送握手信息，包含peerID
            this.hander(client, io);
            var RoomList = await redisServer.getRoomListFromRedis();
            RoomList.forEach((item)=>{
                this.roomListInfo[item] = await redisServer.getRoomSocketInfoList(item);
            });

            if(this.connectedLength <= this.MAX_CLIENT){
                this.assignGuessName(client, io);
                //默认加入第一个会话
                this.joinRoom(client, this.getRoomList().length ? this.getRoomList()[0] : '公共区域', io);
                this.createRoom(client, io);
                this.joinNewRoom(client, io);
                this.handleMassageToAll(client, io);
                this.changeName(client, io);
                //处理连接断开时的场景
                this.clientDisconnect(client, io);
            }else{

            }
        });
    }
}

module.exports = Chat;
