const socket = require('socket.io');
const getLocation = require('./location');

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

    // /分配姓名
    assignGuessName(socket){
        //先判断有没有cookie

        let SOCKETID = this.ctx && this.ctx.cookies.get('SOCKETID'), name;
        if(!SOCKETID || !this.socketInfo[SOCKETID]){
            name = "访客"+ this.guestNumber;
            this.socketInfo[socket.id] = {
                name,
                room:'',
                peerID:'',
                locationInfo:{}
            };
            socket.emit('SOCKETID', socket.id);
            ++this.guestNumber;
        }else{
            socket.id = SOCKETID;
            name = this.socketInfo[SOCKETID].name;
        }

        ////服务器传递给用户的信息，让用户知道他的名称
        socket.emit("nameResult",{  
            success:true,
            name:name
        });

        return this.guestNumber;
    }

    clientDisconnect(client){
        let _self = this;
        client.on("disconnect", function(){
            let nameIndex = _self.nameused.indexOf(_self.socketInfo[client.id].name);///可用于数组找位置
            // delete _self.nameused[nameIndex];
            // delete _self.socketInfo[client.id];
        });
    }

    joinRoom(socket, roomName, io){
        socket.join(roomName);
        this.socketInfo[socket.id].room = roomName;

        if(!this.roomListInfo[roomName]){

            this.roomListInfo[roomName] = [];
        }

        this.roomListInfo[roomName].push(this.socketInfo[socket.id]);

        /////让用户知道自己进入了房间
        socket.emit("join", {
            'currentRoom': roomName,
            text:`${this.socketInfo[socket.id].name} 加入了${roomName}`
        });

        //广播房间列表信息
        io.sockets.emit('roomList', Object.keys(this.roomListInfo));
        // socket.emit('roomList', Object.keys(this.roomListInfo));
        /////让此房间的其他人知道有用户进入了房间
        socket.broadcast.to(roomName).emit("message", {
            text:this.socketInfo[socket.id].name+"has joined this room"
        });
    }

    createRoom(socket, io){
        //创建新的房间
        socket.on("createRoom", (obj) => {
            let oldRoom = this.socketInfo[socket.id].room;
            //离开之前的房间
            this.leaveRoom(socket, oldRoom);

            //加入新房间，更新房间信息
            this.joinRoom(socket, obj.newRoomName, io);
            this.roomListInfo[obj.newRoomName] = [this.socketInfo[socket.id]];
            this.socketInfo[socket.id].room = obj.newRoomName;

            

        });
    }

    joinNewRoom(socket, io){
        socket.on("joinRoom", (obj) => {

            this.leaveRoom(socket, this.socketInfo[socket.id].room);

            this.joinRoom(socket, obj.RoomName, io);
        });
    }

    leaveRoom(socket, roomName){
        socket.leave(roomName);
        var roomList = this.roomListInfo[roomName];
        var index = roomList.indexOf(this.socketInfo[socket.id]);
        roomList.splice(index, 1);
        socket.broadcast.to(roomName).emit('message', {
            text: this.socketInfo[socket.id].name + " 已离开房间"
        });
    }

    handleMassageToAll(socket){
        socket.on("message", (message) => {
            if(message.text !=="" ){
                //让自己知道自己发的信息
                socket.emit("message", {
                    text:this.socketInfo[socket.id].name+":"+message.text
                });

                socket.broadcast.to(this.socketInfo[socket.id].room).emit("message",
                {
                    text:this.socketInfo[socket.id].name+":"+message.text
                });
            }
        });
    }

    changeName(socket){
        socket.on("changeName", (newName) => {
            var oldName = this.socketInfo[socket.id].name;
            this.socketInfo[socket.id].name = newName;
            /////让用户知道自己改了名字
            socket.emit("ChangeNameResult", {'newName':"your new name is "+ newName});

            socket.broadcast.to(this.socketInfo[socket.id].room).emit("message", {
                text:oldName+"rename success, new name is" + newName
            });
        });
    }

    hander(socket, req){
        socket.on('hander', (msg)=>{
            this.socketInfo[socket.id].peerID = msg.peerID;
            //超过最大人数，用P2P连接
            let locationInfo = getLocation(this.remoteAdress);
            this.socketInfo[socket.id].locationInfo = locationInfo;
        });
    }

    middleWear(app){
        app.use(async (ctx, next) => {

            this.remoteAdress = ctx.req.connection.remoteAddress;
            this.ctx = ctx;
            next();
        });
    }

    listen(server, app){
        var io = socket(server);
        this.middleWear(app);
        io.on('connection', (client) => {
            // this.connectedLength++;
            //连接发送握手信息，包含peerID
            this.hander(client, io);

            if(this.connectedLength <= this.MAX_CLIENT){
                this.assignGuessName(client, io);
                //默认加入第一个会话
                this.joinRoom(client, Object.keys(this.roomListInfo).length ? Object.keys(this.roomListInfo)[0] : '公共区域', io);
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
