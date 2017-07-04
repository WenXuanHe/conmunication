import Cookies from 'js-cookie';

export default class Info {

    constructor(io, Chat){
        this.socket = io();
        this.chat = new Chat(this.socket);
        this.CURRENT_ROOM = '';

        this.on();
        this.events();
    }

    appendMsg(message){
        var newElement = $("<div></div>").text(message);
        $("#message").append(newElement);
    }

    on(){
        let socket = this.socket;
        let _self = this;
        //传递SOCKETID
        socket.on('connect_Client', function() {
            socket.emit('connect_Server', {
                SOCKETID: Cookies.get('SOCKETID')
            });
        });

        socket.on("message", function (message) {
            var newElement = $("<div></div>").text(message.msg);
            $("#message").append(newElement);
        });

        /////提示信息
        socket.on("prompt", function (res) {
            var newElement = $("<div class='prompt'></div>").text(res);
            $("#message").append(newElement);
        });

        socket.on('currentRoom', function (current) {
            _self.CURRENT_ROOM = current;
        });

        //接收房间列表信息
        socket.on('roomList', function (roomList) {
            $('#roomList').empty();
            var fragment = document.createDocumentFragment();
            roomList.forEach(function (item) {
                let active = _self.CURRENT_ROOM === item ? 'active' : '';
                var html = `<li class="${active}">${item}</li>`;
                fragment.appendChild($(html)[0]);
            });

            $('#roomList').append(fragment);
            $('#roomList').off('click').on('click', function (e) {
                _self.CURRENT_ROOM = $(e.target).text();
                _self.chat.joinRoom(_self.CURRENT_ROOM);
            });
        });
        //历史对话
        socket.on('chatInfo', function(msg){
            if(!msg) return;
            $("#message").empty();
            var fragment = document.createDocumentFragment();
            msg.forEach(function(item){
                let newElement = $("<div></div>").text(item.msg);
                fragment.appendChild(newElement[0]);
            });
            $("#message").append(fragment);
        });
    }

    events(){
        let _self = this;
        $("#send-button").click(function () {
            _self.chat.sendMessage(document.querySelector('#inputValue').value);
            document.querySelector('#inputValue').value = "";
            $('#inputValue').focus();
        });

        $("#addRoomList").click(function () {
            //稀释点击事件
            if($('#roomName').val() !== _self.CURRENT_ROOM){

                _self.chat.createRoom($('#roomName').val());
                document.querySelector('#roomName').value = "";
            }
        });

        window.onkeydown = function (e) {
            var ev = e || window.event;

            if (ev.keyCode === 13) {
                $("#send-button").focus();
                $("#send-button").trigger("click");
            }
        };
    }
}
////Create the Peer object
// var peer = new window.Peer({key: 'o220qcegi78k6gvi'});

// peer.on('open', function (id) {
//     console.log('My peer ID is: ' + id);
//     //客户端与服务端之间的 WebSocket 通讯连接打开之后，客户端就向服务端发送一条握手消息
//     socket.emit('hander', {
//         peerID: id
//     });
// });








