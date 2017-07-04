let router = require('koa-router')()
var md5 = require('md5');

router.get('/', async function (ctx, next) {
    next();
    return ctx.render('login', {});
})

router.get('/chat', async function (ctx, next) {

    try{
        let name = ctx.query.name;
        next();
        ctx.cookies.set('SOCKETID', md5(name), {
            httpOnly:false
        });

        return ctx.render('index', {userName:name});

    }catch(e){
        console.error(e);
    }

});

module.exports = router;
