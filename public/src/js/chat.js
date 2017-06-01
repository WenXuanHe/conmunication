export default class Chat{

    constructor(socket){
        this.socket = socket;
    }

    //发送消息
    sendMessage(text){
        var data = {
            text:text
        };
        this.socket.emit("message", data);
    }

    //改名
    changeName(newName){
        this.socket.emit("changeName", newName);
    }   

    //新建房间
    createRoom(newRoomName){
        this.socket.emit("createRoom", {
            newRoomName:newRoomName
        });
    }

    getRoomList(){
        this.socket.emit('getRoomList');
    }

    //加入房间
    joinRoom(roomName){
        this.socket.emit("joinRoom", {
            RoomName:roomName,
            oldRoom:$('.current').text()
        });
    }
}
