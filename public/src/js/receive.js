import $ from 'jquery';

export default class receive {

    constructor (socket) {
        this.socket = socket;
    }

    //接收讯息
    receiveMessage () {
        this.socket.on("message", function (message) {
            var newElement = $("<div></div>").text(message.text);

            $("#message").append(newElement);
        });
    }

    //获取所有房间列表信息
    getRoomList () {
        this.socket.on('roomList', function (roomList) {
            $('#roomList').empty();
            roomList.forEach(function (item) {
                $('#roomList').append($('<li></li>').text(item));
            });

        });
    }

}
