const socket = require('socket.io');

class Chat{

    constructor(){
        /////系统默认赋予一个编号
        this.guestNumber = 1;
        ////给名字匹配socketid
        this.nickNames = {};
        ////在房间内的用户
        this.nameused = [];
        ////房间列表
        this.roomList=[];
    }

    // /分配姓名
    assignGuessName(socket){

        let name = "访客"+ this.guestNumber;
        console.log(socket.id);
        this.nickNames[socket.id] = {
            name,
            room:''
        };
        ////给名字匹配一个socketid
        socket.emit("nameResult",{  ////服务器传递给用户的信息，让用户知道他的名称
            success:true,
            name:name
        });
        return ++this.guestNumber;
    }

    clientDisconnect(client){
        let _self = this;
        client.on("disconnect", function(){
            let nameIndex = _self.nameused.indexOf(_self.nickNames[client.id].name);///可用于数组找位置
            delete _self.nameused[nameIndex];
            delete _self.nickNames[client.id];
        });
    }

    joinRoom(socket, roomName){
        socket.join(roomName);
        this.nickNames[socket.id].room = roomName;

        this.roomList.indexOf(roomName) < 0 &&  this.roomList.push(roomName);

        /////让用户知道自己进入了房间
        socket.emit("join", {
            'roomList':this.roomList,
            'currentRoom': roomName,
            text:`${this.nickNames[socket.id].name} 加入了${roomName}`
        });

        /////让此房间的其他人知道有用户进入了房间
        socket.broadcast.to(roomName).emit("message", {
            text:this.nickNames[socket.id].name+"has joined this room"
        });
    }

    createRoom(socket){
        //创建新的房间
        socket.on("createRoom", (obj) => {
            socket.leave(obj.oldRoom)
            this.roomList.push(obj.newRoomName);
            this.joinRoom(socket, obj.newRoomName);
        });
    }

    joinNewRoom(socket){
        socket.on("joinRoom", (obj) => {
            socket.leave(obj.oldRoom);
            joinRoom(socket, obj.RoomName);
        });
    }

    getRoomList(socket){
        socket.on("getRoomList", () => {
            socket.emit('roomList', this.roomList);
        });
    }

    handleMassageToAll(socket){
        socket.on("message", (message) => {
            if(message.text !=="" ){
                //让自己知道自己发的信息
                socket.emit("message", {
                    text:this.nickNames[socket.id].name+":"+message.text
                });

                socket.broadcast.to(this.nickNames[socket.id].room).emit("message",
                {
                    text:this.nickNames[socket.id].name+":"+message.text
                });
            }
        });
    }

    changeName(socket){
        socket.on("changeName", (newName) => {
            var oldName = this.nickNames[socket.id].name;
            this.nickNames[socket.id].name = newName;
            /////让用户知道自己改了名字
            socket.emit("ChangeNameResult", {'newName':"your new name is "+ newName});

            socket.broadcast.to(this.nickNames[socket.id].room).emit("message", {
                text:oldName+"rename success, new name is" + newName
            });
        });
    }

    listen(server){
        let io = socket(server);

        io.on('connection', (client) => {

            let guestNumber = this.assignGuessName(client);
            //默认加入第一个会话
            this.joinRoom(client, this.roomList.length ? this.roomList[0] : '公共区域');
            this.createRoom(client);
            this.joinNewRoom(client);
            this.handleMassageToAll(client);
            this.changeName(client);
            this.getRoomList(client);
            //处理连接断开时的场景
            this.clientDisconnect(client);

        });
    }
}

module.exports = Chat;
