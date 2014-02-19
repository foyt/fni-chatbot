(function() {
  var http = require("http");
  var nconf = require('nconf');
  
  var Bot = require('./bot.njs');
  
  var dataDir = process.env.FNI_CHATBOT_DATADIR || (__dirname + '/data');
  nconf.file({ file: dataDir + '/botconfig.json' });
  var bots = [];

  var config = require(dataDir + '/config.json');
  (config.bots||[]).forEach(function (botConfig) {
    bots.push(new Bot(botConfig.userJid, botConfig.password, botConfig.nick, nconf, dataDir));
  });

  var httpPort = process.env.FNI_CHATBOT_HTTP_PORT || process.env.OPENSHIFT_NODEJS_PORT || "8080";
  var httpIp = process.env.FNI_CHATBOT_HTTP_IP || process.env.OPENSHIFT_NODEJS_IP || "0.0.0.0";
  http.createServer(function(request, response) {
    var status = '200';
    var text = 'OK';
    
    try {
      bots.forEach(function (bot) {
        bot.getRooms().forEach(function (roomJid) {
          this.ping(roomJid, function (err, stanza) {
            if (err) {
              throw new Error("Bot '" + this.getUserJid() + "' reported error: " + err + ' in room "' + roomJid.toString() + '"'); 
            }
          }.bind(bot), 30 * 1000);
        }.bind(bot));
        
      });
    } catch (e) {
      text = 'Error: ' + e;
      status = '500';
    }
    
    response.writeHead(status);
    response.write(text);
    response.end();
  }).listen(httpPort, httpIp);
  
  console.log("Http server listening at " + httpIp + ':' + httpPort);

}).call(this);