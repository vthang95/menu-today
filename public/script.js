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
    getCookie
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

  function renderFoods(today) {
    let sectionFoods = document.getElementById("food-menu");
    if (!sectionFoods) return;

    sectionFoods.setAttribute("data-date", today.date)
    console.log("t", today)

    let foodDoms = today.menu.map(el => `
    <div data-food-id="${el.food.id}" class="food-item">
      <div class="food-form-item">
        <input class="food-selection-item" onclick="FoodChoose.call(this)" data-food-id="${el.food.id}" id="radio-${el.food.id}" type="radio" ${el.users.findIndex(user => user.id == window.User.id) < 0 ? "" : "checked"} name="food" value="${el.food.name}">
        ${el.default ? "" : `<span class="special">Special</span>`}
        <label for="radio-${el.food.id}">${el.food.name} (${el.users.length})</label>
      </div>
      <div id="food-people-${el.food.id}"></div>
    </div>
    `).join("");

    sectionFoods.innerHTML = foodDoms;
  }

  return {
    showLogin,
    checkUserLogged,
    renderFoods
  };
})();

const BackendLogic = (function() {
  

  return {
  }
})();

const Socket = (function() {
  function init() {
    const socket = io();

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
    }
  }

  return {
    init
  }
})();
