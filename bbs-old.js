const express = require('express')
const path = require('path')
const cookieParser = require('cookie-parser')
const port = 8006
const app = express()

//数据库模块引入
const sqlite = require('sqlite')
const sqlite3 = require('sqlite3')
let db
(async function() {
  db = await sqlite.open({
    filename: path.join(__dirname, 'bbs.db'),
    driver: sqlite3.Database,
  })
})()



// 设置模版文件夹的位置
app.set('views', path.join(__dirname, "templates"))
// 设置对应扩展名的模版文件的模版引擎
app.engine('hbs', function(path, option, cb) {
  // path是模版文件的位置
  // option 是传给模版文件的数据
  cb(null,  '<h1>sample</h1>')
})
// 设置pug输出格式化后的html
app.locals.pretty = true
// #region 未使用数据库前数据
// const users = [{
//   id: 1,
//   email: 'a@qq.com',
//   password: '123456',
//   gender: 'f',
//   avatar: '/upload/xckfsdjlfsdf.jpg'
// }]

// const posts = [
//   {
//     id: 1,
//     userId: 1,
//     title: '好吃吗',
//     content: '这些菜好吃吗',
//     timestamp: 43521565,
//     发帖人: 'a@qq.com',
//   },
//   {
//     id: 2,
//     userId: 2,
//     title: '好玩吗',
//     content: '这个地方好玩吗',
//     timestamp: 435215239,
//     发帖人: 'b@qq.com',
//   },
// ]

// const comments = [
//   {
//     id: 1,
//     content: '我吃过，好吃',
//     userId: 1,
//     postId: 1,
//     createAt: 122423752405,
//   },
//   {
//     id: 2,
//     content: '我吃过，好吃',
//     userId: 1,
//     postId: 1,
//     createAt: 122423752405,
//   },
// ]
//#endregion



// =========================================================


app.use((req, res, next) => {
  console.log('重要信息', req.method, req.url, req.cookies, req.signedCookies)
  next()
})

app.use(cookieParser('dsfkjsdkfj'))//使用传入的字符串生成密码，用密码来签名

app.use(express.static(path.join(__dirname, 'static')))
app.use(async (req, res, next) => {
  if (req.signedCookies.loginUser) { //找到登陆用户的rowId 修改成列名改成id, 并将行obj被req.user指向
    req.user = await db.get(
      `SELECT rowId AS id, * from users WHERE email = ?`,
      req.signedCookies.loginUser
    )
  } else {
    req.user = null
  }
  next()
})

app.use(express.json())
app.use(express.urlencoded({ extend: true })) //经过这个中间件，请求体就被解析好了

// 注册页面
app.route('/register')
  .get((req, res, next) => {
    res.render('register.pug')
    //#region 未使用模板html
    // res.type('text/html; charset=UTF-8')
    // res.end(`
    //   <h3>注册账号</h3>
    //   <form action="/register" method="post">
    //     email: <input type="text" name="email" />
    //     password: <input type="password" name="password" />
    //     gender:
    //       <label>
    //         <input type="radio" naem="gender" value="m"> 男
    //       </label>
    //       <label for="">
    //         <input type="radio" naem="gender" value="f"> 女
    //       </label>
    //     <button>注册</button>
    //   </form>`)
    //#endregion
  })
  .post(async (req, res, next) => {
    var { email, password, gender } = req.body
    // 插入数据
    console.log('注册信息',email, password, gender)
    try {
      // 会返回{}, 有插入后lastId属性
      var statementResult = await db.run(
        `INSERT INTO users (email, password, gender, createAt) values (?,?,?,?)`,
        email, password, gender, new Date().toISOString()
      )
      res.end('register success')
    } catch(e) {
      if (e.code == 'SQLITE_CONSTRAINT') {
        res.end('register failed')
      } else {
        next(e)
      }
    }
    // user.id = users.slice(-1)[0].id + 1
    // if (users.some(u => u.email == user.email)) {
    //   res.end('this email has registered, try login')
    // } else {
    //   users.push(user)
    //   res.end('register success')
    // }
  })

// 登陆页面
app.route('/login')
  .get((req, res, next) => {
    res.render('login.pug')
    //#region
    // res.type('text/html; charset=UTF-8')
    // res.end(`
    //   <meta charset="UTF-8"/>
    //   <h3>登录账号</h3>
    //   <form action="/login" method="post">
    //     email: <input type="text" name="email" />
    //     password: <input type="password" name="password" />
    //     <button>登录</button>
    //   </form>
    // `)
    //#endregion
  })
  .post(async (req, res, next) => {
    console.log(req.body)
    var loginInfo = req.body
    // var user = users.find(u => u.email == loginInfo.email && u.password == loginInfo.password)
    var user = await db.get(`SELECT * FROM users WHERE EMAIL = "${loginInfo.email}" AND password = "${loginInfo.password}"`)
    if (user) {
      res.cookie('loginUser', user.email, {maxAge: 6*60*60*1000, signed: true})
      res.cookie('gender', user.gender, {maxAge: 6*60*60*1000, httpOnly: true})
      res.redirect('/')
      // res.render('login-success.pug')
    } else {
      res.end('login info incorrect')
    }
  })

app.get('/logout', (req, res, next) => {
  res.clearCookie('loginUser')
  res.redirect(req.get('referer'))
})

app.get('/', async (req, res, next) => {
  let posts = await db.all('SELECT rowid AS id, * FROM posts')
  let loginUser = req.signedCookies.loginUser
  res.render('index.pug', {posts, loginUser})
  //#region
  // res.type('text/html; charset=UTF-8')
  // res.write(`
  //   <div>
  //     <a href="/">首页</a>
  //     ${
  //       req.signedCookies.loginUser
  //       ? `你好啊，${req.signedCookies.loginUser}<a href="/logout/?next=${req.url}">退出</a>`
  //       : `<a href="/login">登陆</a>&nbsp;<a href="/register">注册</a>`
  //     }
  //   </div>`)
  // res.end(`${posts.map(p => `<li><a href="/post/${p.id}">${p.title}</a></li>`).join('')}`)
  //#endregion
})

// 进入帖子
app.get('/post/:id', async (req, res, next) => {
  // var post = posts.find(post => post.id == req.params.id)
  var post = await db.get(`SELECT rowid AS id, * FROM posts WHERE id = ${req.params.id}`)
  if (post) {
    // var curComments = comments.filter(comment => comment.postId == post.id)
    // db.all 返回多行数据 返回当前帖子下的评论
    var comments = await db.all(`SELECT rowid AS id, * FROM comments  WHERE postId = ${req.params.id}`)
    res.render('post.pug', {post, comments,isLogin: req.signedCookies.loginUser})
    //#region
    // res.type('text/html; charset=UTF-8')
    // res.write(`
    //   <div>
    //     <a href="/">首页</a>
    //     ${
    //       req.signedCookies.loginUser
    //       ? `你好啊，${req.signedCookies.loginUser}<a href="/logout/?next=${req.url}">退出</a>`
    //       : `<a href="/login">登陆</a>&nbsp;<a href="/register">注册</a>`
    //     }
    //   </div>`)
    // res.end(`
    //   <div><h3>${post.title}</h3><p>${post.content}</p>
    //   </div>
    //   <ul>${curComments.map(c => `<li>${c.content} ${new Date(c.createAt).toString()}</li>`).join('')}
    //   </ul>
    //   <form action="/comment" method="post">
    //     <input type="hidden" name="postId" value=${req.params.id}>
    //     <textarea name="content">sfsdf</textarea>
    //     <button>提交评论</button>
    //   </form>
    //   `)
    //#endregion

  } else {
    res.status(404).end('你要找的帖子不存在')
  }
})

// 评论 post请求
app.post('/comment', (req, res, next) => {
  if (req.signedCookies.loginUser) { //用户登陆
    console.log(req.user.id)
    var { detail,  postId } = req.body
    db.run(
      `INSERT INTO comments VALUES (?,?,?,?)`,
      detail, req.user.id, postId, new Date().toISOString()
    )
    //#region
    // comment.userId = users.find(u => u.email == req.signedCookies.loginUser).id
    // comment.id = comments.slice(-1)[0].id + 1
    // comment.createAt = Date.now()
    // comments.push(comment)
    // console.log(req.get('referer'))
    //#endregion
    res.redirect(req.get('referer'))
  } else {
    res.end('not login!!!')
  }
})

app.listen(port, () => {
  console.log('listening on port', port)
})
