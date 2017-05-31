import '../styles/index.scss';
import $ from 'jquery';
import Chat from './chat';

let socket = io.connect();
let chat = new Chat(socket);
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
