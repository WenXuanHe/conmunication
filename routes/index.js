let router = require('koa-router')();
// let crypto = require('crypto');
var md5 = require('md5');

// let getSocketId = function(crypto, name){

//     return new Promise(function(resolve, reject){

//         let salt = crypto.randomBytes(64).toString('base64');
//         crypto.pbkdf2(name, salt, 10000, 64, function(err, hash){
//             if(err) return reject({ code:0, err });

//             hash = new Buffer(hash).toString('hex');
//             resolve({
//                 code:1,
//                 hash
//             });
//         });
//     });
// }

router.get('/', async function (ctx, next) {
    next();
    return ctx.render('login', {});
})

router.get('/chat', async function (ctx, next) {

    try{
        let name = ctx.query.name;
        ctx.cookies.set('SOCKETID', md5(name));

        next();
        return ctx.render('index', {userName:name});
    }catch(e){
        console.error(e);
    }

});

module.exports = router;
