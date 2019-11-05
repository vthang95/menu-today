const express = require('express')
const app = express()
const port = 2000;
const fs = require("fs");
const crypto = require("crypto");
const http = require("http").createServer(app);
const io = require('socket.io')(http);
const { Base } = require("./tools");

function buildLog(userId, foodId) {
  let date = new Date();
  return {
    id: date.getTime(),
    date: date.toLocaleDateString(),
    user: userId,
    food: foodId
  }
}

fs.readFile("data.json", "utf-8", function(err, content) {
  if (!content) {
    let initStore = {
      users: [],
      logs: []
    }
    fs.writeFileSync("data.json", JSON.stringify(initStore), function(err) {
      throw("Cannot init store");
    })
  }
});
fs.readFile("menu-today.json", "utf-8", function(err, content) {
  if (!content) {
    let initMenu= {
      date: '',
      today: [],
      menu: []
    }
    fs.writeFileSync("menu-today.json", JSON.stringify(initMenu), function(err) {
      throw("Cannot init Menu");
    })
  }
});

function getStore() {
  let store = fs.readFileSync("data.json", "utf-8");
  return JSON.parse(store);
}

function getMenu() {
  let menu = fs.readFileSync("menu-today.json", "utf-8");
  return JSON.parse(menu);
}

function saveMenu(menu) {
  fs.writeFileSync("menu-today.json", JSON.stringify(menu), function(err) {
    throw("Cannot save Menu");
  })
}

function saveStore(store) {
  fs.writeFileSync("data.json", JSON.stringify(store), function(err) {
    throw("Cannot save store");
  })
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

app.get('/food-menu', (req, res) => {
  let menu = fs.readFileSync("menu-today.json", "utf-8");
  if (!menu) res.status(422).json({ success: false });
  res.json({ menu: JSON.parse(menu) })
});

app.post("/register", (req, res) => {
  let body = req.body;
  if (body.password.length < 4) return res.redirect("/?error_message=" + "Password phải lớn hơn 4 chữ cái nha")
  if (body.name.indexOf("-") >= 0) return res.redirect("/?error_message=" + "Username không được chứa dấu '-' nha!");

  const secret = 'abcdefg';
  const hash = crypto.createHmac('sha256', secret)
                   .update(body.password)
                   .digest('hex');
  let store = getStore();
  store.users = store.users || [];


  let timestamp = new Date().getTime();
  let userIdx = store.users.findIndex(el => el.name == body.name);
  if (userIdx >= 0) {
    if (store.users[userIdx].password != hash) return res.redirect("/?error_message=" + "Tài khoản này đã được đăng kí. Nhưng password không đúng. HI");
    else {
      res.cookie("ssid", store.users[userIdx].id);
      return res.redirect("/?name="+store.users[userIdx].name+"&id="+store.users[userIdx].id);
    }
  }
  
  let user = { name: body.name, password: hash };
  let buff = Buffer.from(`${user.name}-${timestamp}`);
  user.id = buff.toString("base64");

  store.users.push(user);
  saveStore(store);

  res.cookie("ssid", user.id);
  res.redirect("/?name="+user.name+"&id="+encodeURIComponent(user.id));
});

app.get("/logout", (req, res) => {
  res.clearCookie("ssid");
  res.redirect("/");
})

app.get('/', (req, res) => {
  let cookieStr = req.cookie || "";
  let cookie = cookieStr.split(";").map(el => el.trim().split("=")).reduce((acc, [k, v]) => {
    acc[k] = decodeURIComponent(v);
    return acc;
  }, {});

  let ssid = cookie.ssid;
  console.log("ssid", ssid)
  if (ssid) {
    let store = getStore();
    store.users = store.users || [];
    let userIdx = store.users.findIndex(user => user.id == decodeURIComponent(ssid))
    if (userIdx < 0) return res.redirect("/");
  }

  res.sendfile('public/index_page.html');
});

io.on('connection', function(socket){
  let cookieStr = socket.handshake.headers.cookie || "";
  let cookie = cookieStr.split(";").map(el => el.trim().split("=")).reduce((acc, [k, v]) => {
    acc[k] = decodeURIComponent(v);
    return acc;
  }, {});

  let ssid = cookie.ssid;
  store = getStore();
  store.users = store.users || [];

  if (ssid) {
    let userIdx = store.users.findIndex(user => user.id == ssid);
    if (userIdx < 0) {
      socket.emit("force_logout");
      return;
    };
  } else {
    return;
  }

  let user = Base.decode64(ssid).split("-")[0];

  let menu = getMenu();
  menu.today = menu.today || [];
  

  let today = menu.today.map(el => {
    el.users.map(userId => {
      let userIdx = store.users.findIndex(user => user.id == userId)
      if (userIdx < 0) return { id: userId, name: "UNKNOWN" }
      return { id: userId, name: store.users[userIdx].name }
    })
    return el;
  })

  socket.broadcast.emit("join", user);

  socket.emit("refresh", getToday());

  socket.on('disconnect', function() {
    console.log('disconnected');
  })

  socket.on('choose', function(data) {
    let menu = getMenu();
    menu.today = menu.today || [];
    for (let i = 0; i < menu.today.length; i++) {
      console.log('splice', menu.today[i])
      let userIdx = menu.today[i].users.findIndex((userId => userId == data.userId));
      if (userIdx >= 0) {
        menu.today[i].users.splice(userIdx, 1);
      }
    }

    let itemIdx = menu.today.findIndex(el => el.food == data.foodId);
    if (itemIdx < 0) return; 
    let userIdx = menu.today[itemIdx].users.findIndex(userId => userId == data.userId);
    if (userIdx >= 0) return;
    menu.today[itemIdx].users.push(data.userId);

    saveMenu(menu);
    let today = getToday();

    socket.emit("refresh", today);
    socket.broadcast.emit("refresh", today);
  })
});

function getToday() {
  let menu = getMenu();
  menu.today = menu.today || [];
  store = getStore();
  store.users = store.users || [];

  let today = menu.today.map(el => {
    let foodIdx = (menu.menu || []).findIndex(f => {
      return f.id == el.food
    });

    if (foodIdx < 0) return {};

    return {
      food: menu.menu[foodIdx],
      users: el.users.map(userId => {
        let userIdx = store.users.findIndex(user => user.id == userId)
        if (userIdx < 0) return { id: userId, name: "UNKNOWN" }
        return { id: userId, name: store.users[userIdx].name }
      })
    };
  })

  return { menu: today, date: menu.date };
}

http.listen(port, () => console.log(`Example app listening on port ${port}!`));
