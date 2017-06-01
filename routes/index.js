var router = require('koa-router')();

router.get('/', async function (ctx, next) {
  //做持久化以后，首次加载所有房间

  await ctx.render('index', {
    title: '聊天室',
    remoteAddress:ctx.req.connection.remoteAddress
  });
  next();
})

module.exports = router;
