import '../styles/index.scss';
import $ from 'jquery';
import Cookies from 'js-cookie';
import Chat from './chat';

let socket = io.connect();
let chat = new Chat(socket);
let CURRENT_ROOM = '';
////Create the Peer object
var peer = new Peer({key: 'o220qcegi78k6gvi'});

peer.on('open', function(id) {
  console.log('My peer ID is: ' + id);
    //客户端与服务端之间的 WebSocket 通讯连接打开之后，客户端就向服务端发送一条握手消息
    socket.emit('hander', {
        peerID:id
    });
});

// chat.getRoomList();
socket.on('connect_Client', function(){
    socket.emit('connect_Server',{
        SOCKETID: Cookies.get('SOCKETID')
    });
});

socket.on("message", function(message){
    var newElement = $("<div></div>").text(message.msg);
    $("#message").append(newElement);
});

socket.on("ChangeNameResult", function(newName){
    var newElement = $("<div></div>").text(newName.newName);
    $("#message").append(newElement);
});

/////让用户知道自己进入了房间
socket.on("join", function(res){
    var newElement = $("<div></div>").text(res.msg);
    $("#message").append(newElement);
});
socket.on('currentRoom', function(current){
    CURRENT_ROOM = current;
});
//接收房间列表信息
socket.on('roomList', function(roomList){

    $('#roomList').empty();
    roomList.forEach(function(item){
        var html = `<li class="${CURRENT_ROOM === item ? 'active' : ''}">${item}</li>`;
        $('#roomList').append($(html));
    });

    $('#roomList').off('click').on('click', function(e){
        var room = $(e.target).text();
        chat.joinRoom(room, $('.active').text());
        CURRENT_ROOM = room;
    });
});

$("#send-button").click(function(){
    chat.sendMessage(document.querySelector('#inputValue').value);
    document.querySelector('#inputValue').value="";
    $('#inputValue').focus();
});

$("#addRoomList").click(function(){
    chat.createRoom($('#roomName').val());
    document.querySelector('#roomName').value="";
});

window.onkeydown = function(e){
    var ev = e || window.event;
    if(ev.keyCode==13){
        $("#send-button").focus();
        $("#send-button").trigger("click");
    }
};
