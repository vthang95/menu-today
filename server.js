const express = require('express');
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

const DATA_FILE = "data.json";
const MENU_FILE = "menu-today.json";
const LOCK_PATH = process.env.MENU_LOCK_PATH || "lock";
const UNLOCK_PATH = process.env.MENU_UNLOCK_PATH || "unlock";

fs.readFile("data.json", "utf-8", function(_err, content) {
  if (!content) {
    let initStore = {
      users: [],
      logs: []
    }
    fs.writeFileSync("data.json", JSON.stringify(initStore), function(_err) {
      throw("Cannot init store! ERR CODE: RFD0001");
    })
  }
});
fs.readFile("menu-today.json", "utf-8", function(_err, content) {
  if (!content) {
    let initMenu= {
      date: '',
      today: [],
      menu: []
    }
    fs.writeFileSync("menu-today.json", JSON.stringify(initMenu), function(_err) {
      throw("Cannot init Menu! ERR CODE: RFMT0001 ");
    })
  }
});

function getFileToObj(fileName) {
  let json = fs.readFileSync(fileName, "utf-8");
  return JSON.parse(json);
}

function saveObjectToFile(obj, fileName) {
  fs.writeFileSync(fileName, JSON.stringify(obj), function(_err) {
    throw("Cannot save Menu! ERR CODE: SOTF0001");
  })
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

app.get("/" + LOCK_PATH, (_req, res) => {
  let menu = fs.readFileSync("menu-today.json", "utf-8");
  let menuObj = JSON.parse(menu);
  menuObj.lock = true;
  saveObjectToFile(menuObj, MENU_FILE);
  userSoc.emit("lock")
  res.send("ok")
})

app.get("/" + UNLOCK_PATH, (_req, res) => {
  let menu = fs.readFileSync("menu-today.json", "utf-8");
  let menuObj = JSON.parse(menu);
  menuObj.lock = false;
  saveObjectToFile(menuObj, MENU_FILE);
  userSoc.emit("unlock")
  res.send("ok")
})

app.get('/food-menu', (_req, res) => {
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
  let store = getFileToObj(DATA_FILE);
  store.users = store.users || [];


  let timestamp = new Date().getTime();
  let userIdx = store.users.findIndex(el => el.name == body.name);
  if (userIdx >= 0) {
    if (store.users[userIdx].password != hash) return res.redirect("/?error_message=" + "Tài khoản này đã được đăng kí. Nhưng password không đúng. HI");
    else {
      res.cookie("ssid", store.users[userIdx].id, { maxAge: 123212312312, expires: 123212312312 });
      return res.redirect("/?name="+store.users[userIdx].name+"&id="+encodeURIComponent(store.users[userIdx].id));
    }
  }
  
  let user = { name: body.name, password: hash };
  let buff = Buffer.from(`${user.name}-${timestamp}`);
  user.id = buff.toString("base64");

  store.users.push(user);
  saveObjectToFile(store, DATA_FILE);

  res.cookie("ssid", user.id, { maxAge: 123212312312, expires: 123212312312 });
  res.redirect("/?name="+user.name+"&id="+encodeURIComponent(user.id));
});

app.get("/logout", (_req, res) => {
  res.clearCookie("ssid");
  res.redirect("/");
})

app.get('/atmin', (_req, res) => {
  res.sendfile('public/admin.html');
})

app.get('/', (req, res) => {
  let cookieStr = req.cookie || "";
  let cookie = cookieStr.split(";").map(el => el.trim().split("=")).reduce((acc, [k, v]) => {
    acc[k] = decodeURIComponent(v);
    return acc;
  }, {});

  let ssid = cookie.ssid;
  if (ssid) {
    let store = getFileToObj(DATA_FILE);
    store.users = store.users || [];
    let userIdx = store.users.findIndex(user => user.id == decodeURIComponent(ssid))
    if (userIdx < 0) return res.redirect("/");
  }

  res.sendfile('public/index_page.html');
});

const userSoc = io.of("/users")
userSoc.on('connection', function(socket){
  let cookieStr = socket.handshake.headers.cookie || "";
  let cookie = cookieStr.split(";").map(el => el.trim().split("=")).reduce((acc, [k, v]) => {
    acc[k] = decodeURIComponent(v);
    return acc;
  }, {});

  let ssid = cookie.ssid;
  store = getFileToObj(DATA_FILE);
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

  socket.broadcast.emit("join", user);

  socket.emit("refresh", getToday());

  socket.on('disconnect', function() {
  })

  socket.on('choose', function(data) {
    let menu = getFileToObj(MENU_FILE);
    if (menu.lock) return;
    menu.today = menu.today || [];

    let lastChoose = {};

    for (let i = 0; i < menu.today.length; i++) {
      let userIdx = menu.today[i].users.findIndex((userId => userId == data.userId));
      if (userIdx >= 0) {
        lastChoose = { itemIdx: i };
        menu.today[i].users.splice(userIdx, 1);
      }
    }

    let itemIdx = menu.today.findIndex(el => el.food == data.foodId);
    if (itemIdx < 0) return; 
    let userIdx = menu.today[itemIdx].users.findIndex(userId => userId == data.userId);
    if (userIdx >= 0) return;

    if (lastChoose.itemIdx != itemIdx)
      menu.today[itemIdx].users.push(data.userId);

    saveObjectToFile(menu, MENU_FILE);
    let today = getToday();

    socket.emit("refresh", today);
    socket.broadcast.emit("refresh", today);
  })
});

function getToday() {
  let menu = getFileToObj(MENU_FILE);
  menu.today = menu.today || [];
  store = getFileToObj(DATA_FILE);
  store.users = store.users || [];

  let today = menu.today.map(el => {
    let foodIdx = (menu.menu || []).findIndex(f => {
      return f.id == el.food
    });

    if (foodIdx < 0) return {};

    return {
      food: menu.menu[foodIdx],
      default: !!el.default,
      users: el.users.map(userId => {
        let userIdx = store.users.findIndex(user => user.id == userId)
        if (userIdx < 0) return { id: userId, name: "UNKNOWN" }
        return { id: userId, name: store.users[userIdx].name }
      })
    };
  })

  return { lock: menu.lock, menu: today, date: menu.date, users: store.users.map(el => ({ id: el.id, name: el.name, isDeactive: el.isDeactive })) };
}

const adminSoc = io.of("/atmin");
adminSoc.on("connect", function(socket) {
  let menu = getFileToObj(MENU_FILE);
  let allFoods = menu.menu
  socket.emit("all-foods", allFoods);
})

http.listen(port, () => console.log(`Example app listening on port ${port}!`));
