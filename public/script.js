window.onload = function() {
  FrontendLogic.checkUserLogged();

  let params = Tools.getParams();

  let user = localStorage.getItem("user");
  if (!user) {
    FrontendLogic.showLogin();
  } else {
    let userObj = JSON.parse(user);
    window.User = userObj
    let userDom = document.getElementById("user-name");
    userDom.innerHTML = userObj.name;

    let userForm = document.getElementById("form-user-id");
    userForm.value = userObj.id;
  }

  if (params["error_message"]) {
    let err = document.getElementById("error-message");
    err.innerHTML = params["error_message"];
  }

  Socket.init();
}

const Tools = (function() {
  function request(method, url, data, handler) {
    let xhr = new XMLHttpRequest();
    xhr.onreadystatechange = handler
    xhr.open(method, url);
    xhr.send(data);
  }

  function formatNumber(value, currency, prefix = true) {
    value = value ? value.toString() : "0";
    if (value.includes(".") && value.indexOf(".") > value.length - 3)
      return value;
    let amount = parseInt(value) || 0;
    amount = amount
      ? currency != "VND" && typeof currency != "undefined" && currency
        ? `${Math.floor(amount / 100)
            .toString()
            .replace(/(\d)(?=(\d{3})+(?!\d))/g, "$1,")}${
            amount % 100
              ? prefix
                ? "." + (amount % 100)
                : "." +
                  ((amount % 100) % 10
                    ? amount % 100
                    : Math.floor((amount % 100) / 10))
              : prefix
              ? ".00"
              : ""
          }`
        : amount.toString().replace(/(\d)(?=(\d{3})+(?!\d))/g, "$1,")
      : amount;
    if (typeof currency != "undefined" && prefix)
      return amount + " " + getCurrencySymbol(currency);
    else return amount;
  }

  function getParams() {
    let search = location.search.substr(1);
    return search.split("&").map(el => el.split("=")).reduce((acc, [k, v]) => {
      acc[k] = decodeURIComponent(v);
      return acc;
    }, {});
  }

  function getCookie() {
    let cookie = document.cookie;
    return cookie.split(";").map(el => el.trim().split("=")).reduce((acc, [k, v]) => {
      acc[k] = decodeURIComponent(v);
      return acc;
    }, {});
  }

  return {
    request,
    getParams,
    getCookie,
    formatNumber
  }
})()

const FrontendLogic = (function() {
  function showLogin() {
    let loginEl = document.getElementById("login");
    loginEl.style.display = "flex";
    document.getElementById("content").style.display = "none";
  }

  function checkUserLogged() {
    let cookie = Tools.getCookie();
    if (!cookie.ssid) {
      localStorage.removeItem("user");
      window.User = null;
      return;
    }
    let params = Tools.getParams();
    if (params.id && params.name) {
      let user = { id: params.id, name: params.name };
      localStorage.setItem("user", JSON.stringify(user));
    }
  }

  function renderSummary() {
    let summary = document.getElementById("summary");
    summary.innerHTML = "";

    let menu = document.getElementById("food-menu");
    let sumNum = 0;
    let peopleCount = 0;

    for (let i = 0; i < menu.children.length; i++) {
      let child = menu.children[i];
      if (!child) continue;
      let name = child.getAttribute("data-food-name");
      let price = child.getAttribute("data-food-price");
      let length = child.querySelector(".food-length").innerHTML;
      try {
        price = parseInt(price)
        length = parseInt(length);
        sumNum += price * length;
        peopleCount += length;
      } catch(err) {
        console.log(err)
      }

      if (parseInt(length) > 0) {
        let div = document.createElement("div");
        div.innerHTML = `${name} - <span class="sum-length">${length}</span> x ${Tools.formatNumber(price)} đ`
        summary.appendChild(div);
      }
    }

    let discount = 5;
    let sum = document.createElement("div");
    sum.className = "sum-price";
    sum.innerHTML = `
      <strong>Số người: <span class="sum-number">${peopleCount}</span></strong>,${" "}
      <strong>Tổng tiền: <span class="sum-number">${Tools.formatNumber(sumNum * (1 - (discount / 100)))} đ</span>  (<s>${Tools.formatNumber(sumNum)}</s>)
      `;

    summary.appendChild(sum);
  }

  function unlockMenu() {
    let lockstatus = document.getElementById("lockstatus");
    lockstatus.innerHTML = "";
    let domLock = document.getElementById('menu-lock');
    if (!domLock) return;
    domLock.parentNode.removeChild(domLock);
  }

  function lockMenu() {
    let lockstatus = document.getElementById("lockstatus");
    lockstatus.innerHTML = "<h1 style=\"color: red\">Đã khóa menu</h1>";
    let domLock = document.getElementById('menu-lock');
    if (!domLock) {
      domLock = document.createElement('div');
      domLock.style.width = "100%";
      domLock.style.height = "100%";
      domLock.style.background = "rgba(0,0,0,.1)";
      domLock.style.top = "0";
      domLock.style.left = "0";
      domLock.style.position = "absolute";
      domLock.addEventListener('click', (e) => {
        e.stopPropagation();
      })
    }
    domLock.id = "menu-lock";
    let foodMenu = document.getElementById('food-menu');
    if (!foodMenu) return;
    foodMenu.appendChild(domLock);
  }

  function renderFoods(today) {
    let sectionFoods = document.getElementById("food-menu");
    if (!sectionFoods) return;

    sectionFoods.setAttribute("data-date", today.date)

    let foodDoms = today.menu.map(el => `
    <div data-food-id="${el.food.id}" data-food-name="${el.food.name}" data-food-price="${el.food.price || 0}" class="food-item">
      <div class="food-form-item">
        <input class="food-selection-item" onclick="FoodChoose.call(this)" data-food-id="${el.food.id}" id="radio-${el.food.id}" type="radio" ${el.users.findIndex(user => user.id == window.User.id) < 0 ? "" : "checked"} name="food" value="${el.food.name}">
        ${el.default ? "" : `<span class="special">Special</span>`}
        <label for="radio-${el.food.id}">${el.food.name} (<span class="food-length">${el.users.length}</span>)</label>
      </div>
      <div id="food-people-${el.food.id}"></div>
    </div>
    `).join("");

    sectionFoods.innerHTML = foodDoms;
  }

  function renderUnorderedUsers(users) {
    let dom = document.getElementById("unordered-users");
    if (!dom) return;

    dom.innerHTML = "";
    for (let i = 0; i < users.length; i++) {
      let div = document.createElement("div");
      div.className = "people-item";
      if (users[i].id == window.User.id) {
        div.className += " self";
      }
      div.innerHTML = users[i].name;
      dom.appendChild(div);
    }
  }

  return {
    lockMenu,
    unlockMenu,
    showLogin,
    checkUserLogged,
    renderFoods,
    renderSummary,
    renderUnorderedUsers
  };
})();

const BackendLogic = (function() {
  

  return {
  }
})();

const Socket = (function() {
  function init() {
    const socket = io("/users");

    window.FoodChoose = function() {
      let foodId = this.getAttribute("data-food-id");
      socket.emit("choose", { foodId: foodId, userId: window.User.id });
    }

    socket.on('join', function(user) { handleJoin(user); });
    socket.on('refresh', function(data) { refreshMenu(data); });
    socket.on('force_logout', function() {
      localStorage.removeItem("user");
      window.location.href = "/logout";
    });
    socket.on("lock", function() { FrontendLogic.lockMenu(); })
    socket.on("unlock", function() { FrontendLogic.unlockMenu(); })
  }

  function handleJoin(user) {
    let noti = document.getElementById("noti-message");
    let div = document.createElement("div");

    div.innerHTML = `<span style="color:orange;font-weight:600;font-style:italic">${window.User.name == user ? "Bạn" : user}</span> vừa đăng nhập`;
    div.style.opacity = "0";
    div.style.transition = "opacity 200ms ease-out"

    if (noti.children.length >= 1) {
      noti.removeChild(noti.firstElementChild);
    }
    noti.appendChild(div);

    setTimeout(() => {
      div.style.opacity = "1";
    }, 200);
  }

  function refreshMenu(data) {
    let date = document.getElementById("date");
    date.innerHTML = data.date;

    let menu = data.menu;

    let orderedUsers = menu.reduce((acc, element) => {
      let users = element.users;
      return [...acc, ...users];
    }, []);

    let unorderdUsers = [];

    for (let i = 0; i < data.users.length; i++) {
      if (data.users[i].isDeactive) continue;
      let idx = orderedUsers.findIndex(el => el.id == data.users[i].id);
      if (idx < 0) unorderdUsers.push(data.users[i]);
    }

    FrontendLogic.renderUnorderedUsers(unorderdUsers);

    FrontendLogic.renderFoods(data);
    for (let i = 0; i < menu.length; i++) {
      let foodInfo = menu[i];
      let foodItem = document.querySelector(`[data-food-id="${foodInfo.food.id}"]`)

      let people = document.createElement("div");
      people.className = "people";
      for (let i = 0; i < foodInfo.users.length; i++) {
        let div = document.createElement("div");
        div.innerHTML = foodInfo.users[i].name;
        div.className = "people-item";

        if (foodInfo.users[i].id == window.User.id) {
          div.className += " self"
        }

        people.appendChild(div);
      }

      let peopleContainer = document.getElementById("food-people-" + foodInfo.food.id);
      if (!peopleContainer) return;

      peopleContainer.innerHTML = "";
      peopleContainer.appendChild(people);
      FrontendLogic.renderSummary();
    }

    if (data.lock) FrontendLogic.lockMenu();
  }

  return {
    init
  }
})();
