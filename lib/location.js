var http = require('http');
var util = require('util');

/**
 * 根据 ip 获取获取地址信息
 */
let getLocationInfo = function(url){

    return new Promise(function(resolve, reject){
        http.get(url, function(res) {
            var code = res.statusCode;
            if (code == 200) {
                res.on('data', function(data) {
                    try {
                        resolve(JSON.parse(data));
                    } catch (err) {
                        reject(err);
                    }
                });
            } else {
                resolve({ code: code });
            }
        }).on('error', function(e) {
            reject(e); 
        });
    }); 
}

module.exports = async function(ip){
    var sina_server = 'http://int.dpool.sina.com.cn/iplookup/iplookup.php?format=json&ip=';
    var url = sina_server + ip;
    return await getLocationInfo(url);
}