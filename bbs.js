const express = require('express')
const path = require('path')
const cookieParser = require('cookie-parser')
const svgCaptcha = require('svg-captcha')
const formidable = require('formidable')
const md5 = require('md5')
const nodeMailer = require('nodemailer')
const sessionMiddleware = require('./session-middleware')

// imtp pop3
// const transporter = nodeMailer.createTransport({
//   host: 'smtp.qq.com',
//   port: 587,
//   secure: false,
//   requireTLS: true,
//   auth: {
//     user: 'enter your email address',
//     pass: 'enter your email password'
//   }
// })
// var MailMessage = {
//   from: 'sender email address',
//   to: 'receiver email address',
//   subject: 'Enter Subject Text',
//   text: 'Enter Email Message',
// }
// transporter.sendMail(MailMessage, (err, data) => {
//   if (err) {
//     console.log(err)
//   } else {
//     console.log('Email sent: ', data.response)
//   }
// })


const sqlite = require('sqlite')
const sqlite3 = require('sqlite3')
const MailMessage = require('nodemailer/lib/mailer/mail-message')

const port = 8006
const app = express()

svgCaptcha.options.width = 80
svgCaptcha.options.height = 30
svgCaptcha.options.fontSize = 32
svgCaptcha.options.charPreset = '0123456789'

let db
(async function() {
  db = await sqlite.open({
    filename: path.join(__dirname, 'bbs.db'),
    driver: sqlite3.Database,
  })
})()

// 设置模版文件夹的位置
app.set('views', path.join(__dirname, "templates"))
app.locals.pretty = true

// 签名>${req.signedCookies}
app.use((req, res, next) => {
  console.log(`${req.method.slice(0,3)}  ${req.url}`)
  next()
})
app.use( cookieParser('dsfkjsdkfj') )  //使用传入的字符串生成密码，用密码来签名
app.use( express.static(path.join(__dirname, 'static')) )
app.use('/upload', express.static(path.join(__dirname, 'upload')) ) //头像
app.use(  sessionMiddleware() ) // 导入自写验证码中间件


// req.user = userRowObj || null=undefined
app.use(async (req, res, next) => {
  let { loginUser } = req.signedCookies
  if (loginUser) {
    req.user = await db.get(`SELECT rowId AS id, * from users WHERE email = ?`, loginUser)
  }
  next()
})

app.use(express.json())
app.use(express.urlencoded({ extended: true })) // 解析请求体 body-parser , 在上传头像期间无用

// =========================================================

// /?p=2
app.get('/', async (req, res) => {
  let curPage = req.query.page ?? '1'
  let size = 4

  // 同时查询两个表, 获得发帖人信息
  let posts = await db.all(
    `SELECT posts.rowid AS id, posts.*, users.email, users.avatar
      FROM posts JOIN users
      ON posts.userId = users.rowid
      ORDER BY createAt DESC
      LIMIT ? , ?`,
    (curPage - 1) * size, size)
  let { postCount }  = await db.get(`SELECT count(*) AS postCount FROM posts`)

  let pageCount = Math.ceil(postCount / size)

  res.render('index.pug', {
    posts,
    loginUser: req.signedCookies.loginUser,
    user: req.user,
    pages: {
      size,
      pageCount,
      curPage,
    }
  })
})

app.get('/post/:id', async (req, res) => {
  let post = await db.get(`SELECT rowid AS id, * FROM posts WHERE id = ?`,
    req.params.id)

  db.run(`UPDATE posts SET clicks = ? WHERE rowid = ?`,
    post.clicks + 1 , req.params.id) //更新点击量

  if (!post) {
    res.status(404).end('你要找的帖子不存在')
    return
  }

  let comments = await db.all(
    `SELECT comments.rowid AS id, comments.createAt AS commentTime, *
      FROM comments JOIN users
      ON userId = users.rowid
      WHERE postId = ?`,
    req.params.id) // 先组合表, 再找出 comments有 avatar字段 可读出头像

  res.render('post.pug', {
    post,
    comments,
    user: req.user
  })
})

app.get('/post', (req, res) => {
  res.render( 'add-post.pug', {
    user: req.user
  })
})
app.post('/post', async (req, res) => {
  if (!req.user) {
    res.end('not login!!!')
    return
  }
  let { title, detail } = req.body
  let createAt = new Date().toISOString()
  let statement = await db.run( `INSERT INTO posts VALUES (?,?,?,?,?)`,
    title, detail, req.user.id, createAt, 0)

  res.redirect('/post/' + statement.lastID)
})

// 删帖
app.delete('/post/:id', async (req, res) => {
  if (!req.user) {
    res.status(401).end('not login!!!')
    return
  }
  let postInfo = await db.get(` SELECT * FROM posts WHERE rowid = ?`, req.params.id)
  if (!postInfo) {
    res.end('post not exist')
    return
  }
  if (postInfo.userId !== req.user.id) {
    res.status(401).end('not your post')
    return
  }
  await db.run(`DELETE FROM posts WHERE rowid = ?`, req.params.id)
  res.end()
  // res.redirect(req.get('referer')) //ajax请求后无需重定向页面
})

app.post('/comment', (req, res) => {
  if (!req.user) {
    res.end('not login!!!')
    return
  }
  let { detail,  postId } = req.body
  let createAt = new Date().toISOString()
  db.run(`INSERT INTO comments VALUES (?,?,?,?)`,
    detail, req.user.id, postId, createAt)

  res.redirect(req.get('referer'))
})

app.get('/logout', (req, res) => {
  res.clearCookie('loginUser')
  res.redirect(req.get('referer'))
})


app.get('/register', (req, res) => {
  res.render('register.pug')
})
app.post('/register', async (req, res, next) => {
  const form = formidable({
    multiples: true,
    keepExtensions: true,
    uploadDir: path.join(__dirname, 'upload')
  })

  // 解析上传的文件数据, 表单信息字段挂到info, 文件files
  form.parse(req, async (err, info, files) => {
    let { email, password, gender } = info
    let filename = path.basename(files.avatar.path)
    let createAt = new Date().toISOString()

    let salt = Math.random().toString(16).slice(2, 8)
    password = md5(md5(password) + md5(salt))

    try {
      let stmt = await db.run( `INSERT INTO users VALUES (?,?,?,?,?,?)`,
        email, password, gender, filename,  createAt, salt)
        // 会返回statement{}, 有插入后lastID属性

      res.end('register success')
    } catch(e) {
      if (e.code == 'SQLITE_CONSTRAINT') { //不满足unique约束, 如邮箱已被注册
        res.end('register failed')
        return
      }

      next(e)
    }
  })
})


app.get('/login',(req, res) => {
  res.render('login.pug', {
    referer: req.get('referer')
  })
})
app.post('/login',async (req, res) => {
  let { captcha, email, password, next } = req.body

  if (captcha !== req.session.captcha) {
    res.status(401).json({
      code: -1,
      msg: '验证码错误'
    })
    return
  }

  let user = await db.get('SELECT * FROM users WHERE email = ?', email)
  if (!user || user.password !== md5(md5(password) + md5(user.salt))) {
    //401 un authorized
    res.status(401).json({
      code: -1,              // 业务层错误码, 用于自定义 映射 错误情况
      msg: '用户名或密码错误'
    })
    return
  }

  res.cookie('loginUser', user.email, {maxAge: 6*60*60*1000, signed: true})
  res.cookie('gender', user.gender, {maxAge: 6*60*60*1000, httpOnly: true})
  res.redirect( next ?? '/')

  // res.json({
  //   code: 0,
  //   msg: '登陆成功',
  //   data: {name: 'xxx', avatar: 'xxx.png'}
  // })
  // res.end()
})

app.get('/captcha', async(req, res) => {
  let obj = svgCaptcha.create({
    ignoreChars: '0o1li',
    noise: 3
  })

  req.session.captcha = obj.text
  res.type('image/svg+xml').end(obj.data) //验证码svg
})

app.get('/user/:id', async (req, res) => {
  let userId = req.params.id
  let curUser = await db.get('SELECT * FROM users WHERE rowid = ?', userId)
  if (!curUser) {
    res.status(404).end('该用户不存在')
    return
  }
  let posts = await db.all('SELECT * FROM posts WHERE userId = ?', userId)
  let comments = await db.all(
    `SELECT *, comments.detail AS cDetail
      FROM comments JOIN posts
      ON comments.userId = ? AND comments.postId = posts.rowid`,
    userId)

  let gender = curUser.gender == 'm' ? '他' : '她'

  res.render('user-profile.pug', {
    user: req.user, //当前登陆的用户
    curUser,  // 查看的用户
    gender,
    posts,
    comments
  })
})


app.get('/change-profile', async (req, res) => {
  if (!req.user) {
    res.end('no login!!!')
    return
  }

  res.render('change-profile.pug', {
    user: req.user,
  })
})
app.post('/change-profile', async (req, res) => {
  if (!req.user) { //确保用户已登录
    res.end('no login!!!')
    return
  }

  const form = formidable({
    multiples: true,
    keepExtensions: true,
    uploadDir: path.join(__dirname, 'upload')
  })

  form.parse(req, async (err, info, files) => {
    let { password, gender } = info
    let filename = path.basename(files.avatar.path)

    password = md5(md5(password) + md5(req.user.salt))
    try {
      await db.run('UPDATE users SET password = ?, avatar = ?, gender = ? WHERE rowid = ?',
        password, filename, gender, req.user.id)

      res.end('change-profile success!')
    } catch(e) {
      console.log(e)
    }
  })

})

const changePasswordMap = Object.create(null)
app.get('/forgot', async(req, res) => {
  res.render('forgot.pug' )
})
app.post('/forgot', async(req, res) => {
  var id = Math.random().toString(16).slice(2, 8)
  var url = 'http:/localhost:8006/forgot/' + id

  console.log('修改密码链接:', url)

  changePasswordMap[id] = req.body.email
  setTimeout(() => {
    delete changePasswordMap[id]
  }, 1000 * 60 * 10)

  res.end('Please check out your mailbox')
  // sendEmail(email, '请点击连接修改密码:', url)
})
app.get('/forgot/:token', async(req, res) => {
  let { token } = req.params
  if (!(token in changePasswordMap)) {
    res.end('链接已失效')
    return
  }

  res.render('forgot-change.pug', {
    email: changePasswordMap[token]
  })
})
app.post('/forgot/:token', async(req, res) => {
  let { token } = req.params
  if (!(token in changePasswordMap)) {
    res.end('链接已失效')
    return
  }
  let email = changePasswordMap[token]
  let salt = Math.random().toString(16).slice(2, 8)
  let password = md5(md5(req.body.password) + md5(salt))

  db.run(`UPDATE users SET password = ?, salt = ? WHERE email = ?`,
    password, salt, email)

  // res.redirect('/login')
  res.end('change password success')
})



app.listen(port, () => {
  console.log('端口', port)
})
