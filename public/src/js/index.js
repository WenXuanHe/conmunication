import '../styles/index.scss';
import $ from 'jquery';
import Chat from './chat';

let socket = io.connect();
let chat = new Chat(socket);
////Create the Peer object
var peer = new Peer({key: 'o220qcegi78k6gvi'});

peer.on('open', function(id) {
  console.log('My peer ID is: ' + id);
    //客户端与服务端之间的 WebSocket 通讯连接打开之后，客户端就向服务端发送一条握手消息
    socket.emit('hander', {
        peerID:id,
        remoteAdress:$("#remoteAdress").val()
    }); 
});

chat.getRoomList();

socket.on("message", function(message){
    var newElement = $("<div></div>").text(message.text);
    $("#message").append(newElement);
});

socket.on("ChangeNameResult", function(newName){
    var newElement = $("<div></div>").text(newName.newName);
    $("#message").append(newElement);
});

socket.on("joinResult", function(joinResult){
    var newElement = $("<div></div>").text(joinResult.currentRoom);
    $("#message").append(newElement);
});

/////让用户知道自己进入了房间
socket.on("join", function(res){
    var newElement = $("<div></div>").text(res.text);
    $("#message").append(newElement);
});

//接收房间列表信息
socket.on('roomList', function(roomList){
    console.log(roomList);
    roomList.forEach(function(item){
        
        $('#roomList').append($('<li></li>').text(item));
    });
    
});

$("#send-button").click(function(){
    chat.sendMessage(document.querySelector('#inputValue').value);
    document.querySelector('#inputValue').value="";
});
window.onkeydown = function(e){
    var ev = e || window.event;
    if(ev.keyCode==13){
        $("#send-button").focus();
        $("#send-button").trigger("click");
    }
};
// window.setInterval(function(){
//     socket.emit("room");
// }, 1000);
// socket.on("room", function(room){
//     $("#ul").empty();
//     var text="";
//     for(var i =0; i < room.room.length; i++){
//         if(room.room[i] == room.currentRoom){
//             text += "<li class='current'>" + room.room[i] + "</li>";
//         }else{
//             text += "<li>"+room.room[i] + "</li>";
//         }
//     }
//     $("#ul").append(text);
// });
