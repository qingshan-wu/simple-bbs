module.exports = function() {
  var sessionMap = Object.create(null) //可以存到数据库, 避免服务器重启数据丢失

  return async (req, res, next) => {
      let sid = req.cookies.sessionId
      // cookie有但服务器重启清空 || cookies无 都需要重新建立映射关系
      if (!sid || !(sid in sessionMap)) {
        sid = Math.random().toString(16).slice(2)
        res.cookie('sessionId', sid, { maxAge: 864000000 })
        sessionMap[sid] = {}
      }
      req.session = sessionMap[sid]
      next()
  }
}
