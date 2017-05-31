var router = require('koa-router')();

router.get('/', async function (ctx, next) {
  //做持久化以后，首次加载所有房间
  ctx.state = {
    title: 'koa2 title'
  };

  await ctx.render('index', {

  });
})

module.exports = router;
