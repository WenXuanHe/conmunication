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
        ////所有客户端peerId信息
        this.peerIDInfo = {};
        //////以房间为基本单元储存聊天信息
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

    buildSocketInfoMap({name, room='', peerID='', locationInfo=JSON.stringify({}), chatInfoThroughRoom=JSON.stringify({})}){

        return {
            name, room, peerID, locationInfo, chatInfoThroughRoom
        };
    }

    async setChatInfo(SOCKETID, {roomName, msgInfo}){
        var socketInfoMap = this.socketInfo[SOCKETID];
        var chatInfo = socketInfoMap.chatInfoThroughRoom;
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
                socketInfoMap.chatInfoThroughRoom = JSON.stringify(chatInfo);
            }
            return res;
        }catch(e){
            console.error(e);
        }
    }

    //分配姓名
    async assignGuessName(socket){

        let SOCKETID = socket.SOCKETID;
        //通过id去拿信息
        let guestInfo = await redisServer.getSocketInfoById(SOCKETID);

        if(guestInfo && guestInfo.name){
            //能拿到信息，是以前来过的用户
            this.socketInfo[SOCKETID] = this.buildSocketInfoMap(guestInfo);
            //首次进入，刷新进入一定会有name，只有服务重启时，会获取不到name值
            let name = this.ctx ? this.ctx.query.name : '';
            let chatInfo = JSON.parse(guestInfo.chatInfoThroughRoom);
            if(name){
                //用户刷新，把历史消息展示出来
                socket.emit("chatInfo", chatInfo[guestInfo.room]);
            }
        }else{
            //新用户
            let socketInfoMap = this.buildSocketInfoMap({
                name
            });
            // let socketInfo = [...socketInfoMap].join(',').split(',');
            var result = await redisServer.setSocketInfoToRedis(SOCKETID, socketInfoMap);
            if(result.code){
                this.socketInfo[SOCKETID] = socketInfoMap;
            }
            socket.emit("nameResult", this.buildMsg(name, `欢迎${name}加入`));
        }
    }

    clientDisconnect(client){
        let _self = this;
        client.on("disconnect", function(){
            //断开连接时，默认不再连接。
            let SOCKETID = client.SOCKETID;
            let room = _self.socketInfo[SOCKETID].room;
            _self.roomListInfo[room] = _self.roomListInfo[room].filter((item) => item.name !== _self.socketInfo[SOCKETID].name);
            delete _self.socketInfo[SOCKETID];
        });
    }

    async joinRoom(socket, roomName, io){

        try{
            let SOCKETID = socket.SOCKETID;
            let users = this.socketInfo[SOCKETID];

            socket.join(roomName);
            //以房间为基本单元储存聊天信息
            if(!this.chatMessageInfo[roomName]){
                this.chatMessageInfo[roomName] = [];
            }
            //设置新房间
            let setSocketInfoSingle =await redisServer.setSocketInfoSingleToRedis(SOCKETID, 'room', roomName);
            if(setSocketInfoSingle.code){
                users.room = roomName;
            }
            //将当前用户加到房间
            // let socketInfo = [...users].join(',').split(',');
            let setSocketInfo = await redisServer.setSocketInfoToRedis(SOCKETID, users);
            if(setSocketInfo.code){
                this.roomListInfo[roomName].push(users);
            }

            /////让用户知道自己进入了房间
            socket.emit("prompt", "欢迎你！ "+ users.name);
            //返回当前房间
            socket.emit("currentRoom", users.room);
            //通知房间列表信息
            io.sockets.emit('roomList', this.getRoomList());
            /////让此房间的其他人知道有用户进入了房间
            socket.broadcast.to(roomName).emit("message", {
                msg:users.name + " 加入了房间"
            });
        }catch(e){
            console.error(e);
        }
    }

    createRoom(socket, io){
        var _self = this;
        //创建新的房间
        socket.on("createRoom", async function(obj){
            let SOCKETID = socket.SOCKETID;
            let oldRoom = _self.socketInfo[SOCKETID].room;
            //离开之前的房间
            _self.leaveRoom(socket, oldRoom);
            //创建一个新的房间
            let pushRoomList = await redisServer.pushRoomListToRedis(obj.newRoomName);
            if(pushRoomList.code){
                _self.roomListInfo[obj.newRoomName] = [];
            }
            //加入新房间，更新房间信息
            _self.joinRoom(socket, obj.newRoomName, io);

        });
    }

    joinNewRoom(socket, io){
        socket.on("joinRoom", (obj) => {

            let { room, chatInfoThroughRoom } = this.socketInfo[socket.SOCKETID];
            let chatInfo = JSON.parse(chatInfoThroughRoom);

            if(obj.roomName !== room){
                this.leaveRoom(socket, obj.roomName);
                //切换房间展示历史会话
                socket.emit("chatInfo", chatInfo[obj.roomName]);
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

            let msgInfo = this.buildMsg(users.name, `${users.name}  已离开房间`);
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
                    text = `${users.name} : ${text}`;
                    let msgInfo = this.buildMsg(users.name, text);

                    socket.emit("message", msgInfo);

                    socket.broadcast.to(this.socketInfo[SOCKETID].room).emit("message", msgInfo);
                    let setChatInfo = this.setChatInfo(SOCKETID, {
                        roomName: users.room,
                        msgInfo
                    }).then(function(result){
                        if(result.code){
                            this.chatMessageInfo[users.room].push(msgInfo);
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
                let { name } = this.socketInfo[SOCKETID];
                let prompt_msg = `${name} rename success, new name is ${newName}`;
                let result =await redisServer.setSocketInfoSingleToRedis(SOCKETID, 'name', newName);
                if(result.code){
                    this.socketInfo[SOCKETID].name = newName;
                }
                /////让用户知道自己改了名字
                socket.emit("prompt", prompt_msg);
                socket.broadcast.to(room).emit("prompt", prompt_msg);
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

                this.socketInfo[SOCKETID].peerID = msg.peerID;
                this.socketInfo[SOCKETID].locationInfo = locationInfo;
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
