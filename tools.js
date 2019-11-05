const Base = (function() {
  function encode64(str) {
    let buff = Buffer.from(str);
    return buff.toString("base64");
  }
  function decode64(str) {
    let buff = Buffer.from(str, "base64");
    return buff.toString('ascii');
  }

  return {
    encode64,
    decode64
  }
})();

module.exports = { Base };
