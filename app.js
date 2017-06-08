const Koa = require('koa');
const app = new Koa();
const http = require('http');
const views = require('koa-views');
const json = require('koa-json');
const onerror = require('koa-onerror');
const bodyparser = require('koa-bodyparser')();
const logger = require('koa-logger');
const render = require('koa-swig');
const co = require('co');
const path = require('path');
const index = require('./routes/index');
const session = require('koa-session2');
const ExpressPeerServer = require('peer').ExpressPeerServer;
// error handler
onerror(app);
var options = {
    debug: true
};

app.use(session());

app.context.render = co.wrap(render({
    root: path.join(__dirname, '/views'),
    autoescape: true,
    cache: 'memory',
    ext: 'html',
    writeBody: true
}));

// middlewares
app.use(bodyparser);
app.use(json());
app.use(logger());
app.use(require('koa-static')(__dirname + '/public'));

app.use(views(__dirname + '/views', {
  extension: 'jade'
}));

// logger
app.use(async (ctx, next) => {
  const start = new Date();
  await next();
  const ms = new Date() - start;
  console.log(`${ctx.method} ${ctx.url} - ${ms}ms`);
});

let server = http.createServer(app.callback());
// routes
app.use(index.routes(), index.allowedMethods(), ExpressPeerServer(server, options));

server.on('connection', function(id) {
  console.log("id" + id + "is connection");
});

server.on('disconnect', function(id) {
  console.log("id" + id + "is disconnect");
});

module.exports = app;
