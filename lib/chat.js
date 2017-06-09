const socket = require('socket.io');
const getLocation = require('./location');
const redis = require("redis");
const redisClient = redis.createClient();
const RedisServer = require('./redis_server');
const redisServer =  new RedisServer(redisClient);

class Chat{

    constructor(){
        ////以socketID代表一个客户端，映射客户端信息
        this.socketInfo = {};
        ////在房间内的用户
        this.nameused = [];
        ////所有客户端peerId信息
        this.peerIDInfo = {};

        this.chatMessageInfo = {};
        ////房间列表
        this.roomListInfo={};
        ////已连接人数
        this.connectedLength = 0;
        //websocket连接的上限数，超过了就用P2P技术
        this.MAX_CLIENT = 3;
        ////当前remoteAdress
        this.remoteAdress = '';

        this.ctx = null;
    }

    buildMsg(userName, msg){
        return {
            userName,
            msg
        }
    }
    // /分配姓名
    async assignGuessName(socket){
        //先判断有没有cookie

        let SOCKETID = socket.SOCKETID, name;

        if(!SOCKETID || !this.socketInfo[SOCKETID]){
            //用map结构代替object结构
            name = this.ctx ? this.ctx.query.name : '';
            var socketInfoMap = new Map();
            socketInfoMap.set('name', name);
            socketInfoMap.set('room', '');
            socketInfoMap.set('peerID', '');
            socketInfoMap.set('locationInfo', JSON.stringify({}));
            let socketInfo = [...socketInfoMap].join(',').split(',');
            var result = await redisServer.setSocketInfoToRedis(SOCKETID, socketInfo);
            if(result.code){
                this.socketInfo[SOCKETID] = socketInfoMap;
            }
        }else{
            name = this.socketInfo[SOCKETID].get('name');
        }

        ////服务器传递给用户的信息 todo
        socket.emit("nameResult", this.buildMsg(name, `欢迎${name}加入`));
    }

    clientDisconnect(client){
        let _self = this;
        client.on("disconnect", function(){
            // let nameIndex = _self.nameused.indexOf(_self.socketInfo[client.id].name);///可用于数组找位置
            // delete _self.nameused[nameIndex];
            // delete _self.socketInfo[client.id];
        });
    }

    async joinRoom(socket, roomName, io){

        try{
            let SOCKETID = socket.SOCKETID;
            socket.join(roomName);

            //以房间为基本单元储存聊天信息
            this.chatMessageInfo[roomName] = [];
            var users = this.socketInfo[SOCKETID];

            let setSocketInfoSingle =await redisServer.setSocketInfoSingleToRedis(SOCKETID, 'room', roomName);
            if(setSocketInfoSingle.code){
                users.set('room', roomName);
            }

            if(!this.roomListInfo[roomName]){
                //无房间创建房间
                let pushRoomList = await redisServer.pushRoomListToRedis(roomName);
                if(pushRoomList.code){
                    this.roomListInfo[roomName] = [];
                }
            }

            //将当前用户加到房间
            let socketInfo = [...users].join(',').split(',');
            let setSocketInfo = await redisServer.setSocketInfoToRedis(SOCKETID, socketInfo);
            if(setSocketInfo.code){
                this.roomListInfo[roomName].push(users);
            }

            /////让用户知道自己进入了房间
            let msgInfo = this.buildMsg(users.get('name'), `${users.get('name')} 加入了${roomName}`);
            socket.emit("join", msgInfo);
            //返回当前房间
            socket.emit("currentRoom", users.get('room'));

            let setChatInfo = await redisServer.setChatInfoByRoom(roomName, msgInfo);
            if(setChatInfo.code){
                this.chatMessageInfo[roomName].push(msgInfo);
            }

            //通知房间列表信息
            io.sockets.emit('roomList', this.getRoomList());
            /////让此房间的其他人知道有用户进入了房间
            socket.broadcast.to(roomName).emit("message", {
                text:this.socketInfo[SOCKETID].get('name')+"has joined this room"
            });
        }catch(e){
            console.error(e);
        }
    }

    createRoom(socket, io){
        //创建新的房间
        socket.on("createRoom", (obj) => {
            let SOCKETID = socket.SOCKETID;

            let oldRoom = this.socketInfo[SOCKETID].get('room');
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
            let SOCKETID = socket.SOCKETID;
            this.leaveRoom(socket, this.socketInfo[SOCKETID].get('room'));

            this.joinRoom(socket, obj.RoomName, io);
        });
    }

    async leaveRoom(socket, roomName){

        try{

            let SOCKETID = socket.SOCKETID;
            let users = this.socketInfo[SOCKETID];
            let removeSocketIn = await redisServer.removeSocketInfoById(roomName, SOCKETID);

            socket.leave(roomName);
            if(removeSocketIn.code){
                let socketList = this.roomListInfo[roomName];
                let index = socketList.indexOf(users);
                socketList.splice(index, 1);
            }

            let msgInfo = this.buildMsg(users.get('name'), `${users.get('name')}  已离开房间`);
            socket.broadcast.to(roomName).emit('message', msgInfo);

            let setChatInfo = await redisServer.setChatInfoByRoom(roomName, msgInfo);
            if(setChatInfo.code){
                this.chatMessageInfo[roomName].push(msgInfo);
            }

        }catch(e){
            console.error(e);
        }
    }

    handleMassageToAll(socket){
        socket.on("message", async (message) => {
            try{
                let {SOCKETID, text} = message;
                if(text !=="" ){

                    //让自己知道自己发的信息
                    let users = this.socketInfo[SOCKETID];
                    text = `${users.get('name')} : ${text}`;
                    let msgInfo = this.buildMsg(users.get('name'), text);

                    socket.emit("message", msgInfo);

                    socket.broadcast.to(this.socketInfo[SOCKETID].get('room')).emit("message", msgInfo);

                    let setChatInfo = await redisServer.setChatInfoByRoom(users.get('room'), msgInfo);
                    if(setChatInfo.code){
                         this.chatMessageInfo[users.get('room')].push(msgInfo);
                    }

                }
            }catch(e){
                console.error(e);
            }
        });
    }

    changeName(socket){
        socket.on("changeName", async (newName) => {

            try{
                let SOCKETID = socket.SOCKETID;
                let users = this.socketInfo[SOCKETID];
                let oldName = users.get('name');
                users.set('name', newName);
                let msgInfo = this.buildMsg(newName, `your new name is ${newName}`);
                socket.emit("ChangeNameResult", msgInfo);
                socket.broadcast.to(this.socketInfo[SOCKETID].get('room')).emit("message", {
                    msg:`${oldName} rename success, new name is ${newName}`
                });
                /////让用户知道自己改了名字
                let setChatInfo = await redisServer.setChatInfoByRoom(newName, msgInfo);
                if(setChatInfo.code){
                    this.chatMessageInfo[newName].push(msgInfo);
                }
            }catch(e){
                console.error(e);
            }
        });
    }

    hander(socket, req){
        socket.on('hander', (msg)=>{
            try{
                let SOCKETID = socket.SOCKETID;
                if(!this.socketInfo[SOCKETID]){
                    this.socketInfo[SOCKETID] = new Map();
                }

                this.socketInfo[SOCKETID].set('peerID', msg.peerID);
                this.socketInfo[SOCKETID].set('locationInfo', locationInfo);
                //超过最大人数，用P2P连接
                // let locationInfo = getLocation(this.remoteAdress);
            }catch(e){
                console.error(e);
            }
        });
    }

    getRoomList(){
        return Object.keys(this.roomListInfo);
    }

    listen(server, app){
        var io = socket(server);
        var _self = this;
        app.use(async function(ctx, next){
            _self.ctx = ctx;
            ctx.io = io;
            next();
        });

        io.on('connection', async function(client) {

            client.emit('connect_Client');
            client.on('connect_Server', async function(SOCKET){
                // this.connectedLength++;
                //连接发送握手信息，包含peerID
                // _self.hander(client, io);
                client.SOCKETID = SOCKET.SOCKETID;
                try{

                    let RoomList = await redisServer.getRoomListFromRedis();
                    if(RoomList.length > 0){
                        //默认展示第一个房间的信息，等待加载
                        let firstRoom = RoomList.shift();
                        _self.roomListInfo[firstRoom] = await redisServer.getRoomSocketInfoList(firstRoom);
                        //异步加载其他的房间信息
                        RoomList.map((item)=>{
                            redisServer.getRoomSocketInfoList(item)
                            .then(function(socketInfoList){
                                _self.roomListInfo[item] =  socketInfoList;
                            })
                        });
                    }

                    if(_self.connectedLength <= _self.MAX_CLIENT){
                        await _self.assignGuessName(client, io);
                        //默认加入第一个会话
                        _self.joinRoom(client, _self.getRoomList().length ? _self.getRoomList()[0] : '公共区域', io);
                        _self.createRoom(client, io);
                        _self.joinNewRoom(client, io);
                        _self.handleMassageToAll(client, io);
                        _self.changeName(client, io);
                        //处理连接断开时的场景
                        _self.clientDisconnect(client, io);
                    }else{

                    }
                }catch(e){
                    console.error(e);
                }
            });
        });
    }
}

module.exports = Chat;
