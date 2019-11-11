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
})();

window.onload = function() {
  socket = io("/atmin");

  socket.on("all-foods", function(data) {
  })
}
