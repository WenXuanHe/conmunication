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

        this.server = null;
        this.app = null;
        this.ctx = null;
    }

    buildMsg(userName, msg){
        return {
            userName,
            msg
        }
    }

    buildSocketInfoMap({name, room, peerID, locationInfo, chatInfo = {}}){
        var socketInfoMap = new Map();
            socketInfoMap.set('name', name);
            socketInfoMap.set('room', room);
            socketInfoMap.set('peerID', peerID);
            socketInfoMap.set('locationInfo', locationInfo);
            //储存对话信息
            socketInfoMap.set('chatInfoThroughRoom', JSON.stringify(chatInfo));
            return socketInfoMap;
    }

    async setChatInfo(SOCKETID, {roomName, msgInfo}){
        var socketInfoMap = this.socketInfo[SOCKETID];
        var chatInfo = socketInfoMap.get('chatInfoThroughRoom');
        chatInfo = JSON.parse(chatInfo);

        if(Array.isArray(chatInfo[roomName])){
            chatInfo[roomName].push(msgInfo);
        }else{
            chatInfo[roomName] = [msgInfo];
        }
        
        // 每一个房间最多留20条数据
        chatInfo[roomName].slice(-20);

        try{
             let res = await redisServer.setChatInfoByRoom(SOCKETID, 'chatInfoThroughRoom', JSON.stringify(chatInfo));
            if(res.code){
                socketInfoMap.set('chatInfoThroughRoom', JSON.stringify(chatInfo));
            }
            return res;
        }catch(e){
            console.error(e);
        }
    }

    //分配姓名
    async assignGuessName(socket){
        //先判断有没有cookie

        let SOCKETID = socket.SOCKETID, name, chatInfo;

        if(!SOCKETID || !this.socketInfo[SOCKETID] || !this.socketInfo[SOCKETID].get('name')){
            //用map结构代替object结构
            name = this.ctx ? this.ctx.query.name : '';
            if(!name){
                // 通过id去拿name
               let guestInfo = await redisServer.getSocketInfoById(SOCKETID);
               this.socketInfo[SOCKETID] = this.buildSocketInfoMap(guestInfo);
            }else{
                //首次进入聊天室，建立数据仓库
                let socketInfoMap = this.buildSocketInfoMap({
                    name,
                    room:'',
                    peerID:'',
                    locationInfo:JSON.stringify({})
                });
                let socketInfo = [...socketInfoMap].join(',').split(',');
                var result = await redisServer.setSocketInfoToRedis(SOCKETID, socketInfo);
                if(result.code){
                    this.socketInfo[SOCKETID] = socketInfoMap;
                }

                socket.emit("nameResult", this.buildMsg(name, `欢迎${name}加入`));
            }
            
        }else{
            name = this.socketInfo[SOCKETID].get('name');
            chatInfo = this.socketInfo[SOCKETID].get('chatInfoThroughRoom');
            chatInfo = JSON.parse(chatInfo);
            socket.emit("chatInfo", chatInfo[this.socketInfo[SOCKETID].get('room')]);
        }
    }

    clientDisconnect(client){
        let _self = this;
        client.on("disconnect", function(){
            //断开连接时，默认不再连接。
            let SOCKETID = client.SOCKETID;
            let room = _self.socketInfo[SOCKETID].get('room');
            _self.roomListInfo[room] = _self.roomListInfo[room].filter((item) => item.get('name') !== _self.socketInfo[SOCKETID].get('name'));
            delete _self.socketInfo[SOCKETID];
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

            let setChatInfo = this.setChatInfo(SOCKETID, {
                roomName, msgInfo
            }).then(function(result){
                 if(result.code){
                    this.chatMessageInfo[roomName].push(msgInfo);
                }
            }.bind(this));
           
            //通知房间列表信息
            io.sockets.emit('roomList', this.getRoomList());
            /////让此房间的其他人知道有用户进入了房间
            socket.broadcast.to(roomName).emit("message", {
                msg:this.socketInfo[SOCKETID].get('name')+" has joined this room"
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
            let room = this.socketInfo[SOCKETID].get('room');
            if(obj.roomName !== room){

                this.leaveRoom(socket, room);

                this.joinRoom(socket, obj.roomName, io);
            }
            
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
            let setChatInfo = this.setChatInfo(SOCKETID, {
                roomName, msgInfo
            }).then(function(result){
                if(result.code){
                    this.chatMessageInfo[roomName].push(msgInfo);
                }
            }.bind(this));
            
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
                    let setChatInfo = this.setChatInfo(SOCKETID, {
                        roomName: users.get('room'), 
                        msgInfo
                    }).then(function(result){
                        if(result.code){
                            this.chatMessageInfo[users.get('room')].push(msgInfo);
                        }
                    }.bind(this));
                   
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
                let roomName = this.socketInfo[SOCKETID].get('room');
                users.set('name', newName);
                let msgInfo = this.buildMsg(newName, `your new name is ${newName}`);
                socket.emit("ChangeNameResult", msgInfo);
                socket.broadcast.to(room).emit("message", {
                    msg:`${oldName} rename success, new name is ${newName}`
                });
                /////让用户知道自己改了名字
                let setChatInfo = this.setChatInfo(SOCKETID, {
                    roomName,
                    msgInfo
                }).then(function(result){
                    if(result.code){
                        this.chatMessageInfo[newName].push(msgInfo);
                    }
                }.bind(this));
                
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
        this.server = server;
        this.app = app;
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
