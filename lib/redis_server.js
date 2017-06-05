class RedisServer {

    constructor(redisClient){
        this.redisClient = redisClient;
        this.connection = false;
        this.connectionError = '';
        redisClient.on("error", function (err) {
            console.log("Error " + err);
        });

        redisClient.select('0', (error)=>{
            if (error) {
                this.connectionError = error;
                return ;
            }
            this.connection = true;
        });
    }
    /**
     * 封装promise， 避免每次都写
     * @param {*} callBack 具体执行的函数 
     */
    promise(callBack){
         return new Promise(function(resolve, reject){
            if(_self.connection){
                callBack(resolve, reject);
            }else{
                 reject(this.connectionError);
            }
         });
    }

    /***********  set操作  ***************/

    /**
     * 新增房间到roomList
     * @param {*} roomName  新房间名
     */
    pushRoomListToRedis(roomName){
        var _self = this;
        return this.promise(function(resolve, reject){
                //加载所有房间列表
            _self.redisClient.rpush('list:roomList', roomName, function(error, res){

                if(error) {
                    reject(error);
                } else {
                    resolve(res);
                }
            });
        });
    }
    /**
     * 设置socketInfo
     * @param {*} id socketId
     * @param {*} con  结构为 key,value, key2, value2
     */
    setSocketInfoToRedis(id, ...con){
        var _self = this;
        return this.promise(function(resolve, reject){

            let key = 'list:socketInfo:' + id;
            //储存socketInfo
            _self.redisClient.hmset(key, ...con, function(error, res){
                if(error) {
                    reject(error);
                } else {
                    resolve(res);
                }
            });
        });
    }

    /**
     * 更新socketInfo单个字段的值
     * @param {*} id  socketId
     * @param {*} name 字段名
     * @param {*} value 值
     */
    setSocketInfoSingleToRedis(id, name, value){
        var _self = this;
        return this.promise(function(resolve, reject){

            let key = 'list:socketInfo:' + id;
            
            _self.redisClient.hset(key, name, value, function(error, res){
                if(error) {
                    reject(error);
                } else {
                    resolve(res);
                }
            });
        });
    }

    /***********  set操作  ***************/

    /***********  get操作  ***************/
    /**
     * 获取房间列表
     */
    getRoomListFromRedis(){
        var _self = this;
        return this.promise(function(resolve, reject){
            //加载所有房间列表
            _self.redisClient.lrange('list:roomList', '0', '-1', function(error, res){

                if(error) {
                    console.log(error);
                    reject(error);
                } else {
                    console.log(res);
                    resolve(res);
                }
            });
        });
    }
    /**
     * 通过socketiD获取socketInfo信息
     * @param {*} id  socketiD
     */
    getSocketInfoById(id){
        var _self = this;
        return this.promise(function(resolve, reject){

            let key = 'list:socketInfo:' + id;
                //根据socketID得到socketInfo
            _self.redisClient.hgetall(key, function(error, res){
                if(error) {
                    reject(error);
                } else {
                    resolve(res);
                }
            });
        });
    }
    /**
     * 获得某一房间下的客户端信息
     * @param {*} roomName 
     */
    getRoomSocketInfoList(roomName){
        var _self = this, socketInfoList=[];
        var getSocketInfoByIdAsync = async function(socketId){
            return await _self.getSocketInfoById(socketId);
        }

        return this.promise(function(resolve, reject){
            //加载房间下的客户端
            _self.redisClient.lrange('list:roomName:'+ roomName, '0', '-1', function(error, res){

                if(error) reject(error);
                if(res && res.length > 0){
                    res.forEach(function(socketId){
                        socketInfoList[socketId] = getSocketInfoByIdAsync(socketId);
                    });
                }
                resolve(socketInfoList);
            });
        });
    }
    /***********  get操作  ***************/
}
module.exports = RedisServer;
