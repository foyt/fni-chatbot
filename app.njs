(function() {
  var http = require("http");
  var nconf = require('nconf');
  
  var Bot = require('./bot.njs');
  
  var dataDir = process.env.FNI_CHATBOT_DATADIR || (__dirname + '/data');
  nconf.file({ file: dataDir + '/bocconfig.json' });

  var bot = new Bot(process.env.FNI_CHATBOT_USERJID, process.env.FNI_CHATBOT_PASSWORD, process.env.FNI_CHATBOT_NICK, nconf, dataDir);

  var httpPort = process.env.FNI_CHATBOT_HTTP_PORT || process.env.OPENSHIFT_NODEJS_PORT || "8080";
  var httpIp = process.env.FNI_CHATBOT_HTTP_IP || process.env.OPENSHIFT_NODEJS_IP || "0.0.0.0";
  http.createServer(function(request, response) {
    response.writeHead(200);
    response.write("OK");
    response.end();
  }).listen(httpPort, httpIp);

}).call(this);