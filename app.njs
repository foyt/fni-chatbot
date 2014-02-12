(function() {
  var DEFAULT_ROOM_SETTINGS = {
    'locale': 'fi'
  };
  
  var i18n = require("i18n");
  var nconf = require('nconf');
  var dirty = require('dirty');
  var http = require("http");

  var moderators = dirty('moderators.db');
  moderators.set('online', []);
  
  var Bot = require('./bot.njs');

  /* Locale */

  i18n.configure({
    locales:['en', 'fi'],
    directory: __dirname + '/locales'
  });

  /* Conf */

  nconf.file({ file: process.env.FNI_CHATBOT_ROOM_CONFIG || 'config.json' });

  /* Bot */

  var bot = new Bot(process.env.FNI_CHATBOT_USERJID, process.env.FNI_CHATBOT_PASSWORD, process.env.FNI_CHATBOT_NICK);

  /* Events */

  bot.on("online", function (data) {
    console.log("Bot online");
    var rooms = nconf.get('rooms');
    if (rooms) {
      Object.keys(rooms).forEach(function (room) {
        this.joinRoom(room, this.nick);
      }.bind(this));
    }
  }.bind(bot));

  bot.on("offline", function (data) {
    console.log("Bot offline");
  });

  bot.on("presence", function (data) {
    if (data.role == 'moderator') {
      var moderatorsOnline = moderators.get('online');
      moderatorsOnline.push(data.fromJID.toString());
      moderators.set('online', moderatorsOnline);
    }
  }.bind(bot));

  bot.on("invite-message", function (data) {
    console.log("Invited to chat room " + data.fromJID.toString());
    var roomJID = data.fromJID.toString();
    nconf.set('rooms:' + roomJID, DEFAULT_ROOM_SETTINGS);
    nconf.save(function (err) {
      if (!err) {
        this.joinRoom(roomJID, this.nick);
      } else {
        console.err(e);
      }
    }.bind(this));
  }.bind(bot));

  bot.on("command.chat.roomSetting", function (data) {
    if (data.args) {
      var moderatorsOnline = moderators.get('online');
   
      if (moderatorsOnline.indexOf(data.fromJID.toString()) != -1) {
        var settingIndex = data.args.indexOf(' ');
        if (settingIndex > -1) {
          var setting = data.args.substring(0, settingIndex);
          var value = data.args.substring(settingIndex + 1);    
          if (setting && value) {
            var roomJID = data.fromJID.bare();
            var roomConfig = nconf.get('rooms:' + roomJID.toString());
            roomConfig[setting] = value;
            nconf.set('rooms:' + roomJID.toString(), roomConfig);
          }
        }
      }
    }
  });

  function rollFudge(locale, roll, roller) {
    var plus = '[+]';
    var minus = '[-]';
    var empty = '[ ]';
      
    var dice = [];
    var numericResult = 0;
    for (var i = 0, l = 4; i < l; i++) {
      var die = Math.round(Math.random() * 2) - 1;
      dice.push(die === 0 ? empty : die === -1 ? minus : plus);
      numericResult += die;
    }
      
    return i18n.__({phrase: '%s rolled %s', locale: locale}, roller, dice.join(' '));
  }

  function rollDie(locale, roll, roller) {
    if ((new RegExp("^[d0-9-+/*()]*$")).test(roll) && (!roll.match(/d[^0-9]/))) {
      try {
        var evil = eval;
        result = evil('Math.round(' + roll
          .replace(/([0-9]{1,})([\*]{0,1})(d)([0-9]{1,})/g, "($1*(1 + (Math.random()*($4 - 1))))")
          .replace(/(d)([0-9]{1,})/g, "(1 + (Math.random()*($2 - 1)))") + ')');
        return i18n.__({phrase: '%s rolled %s (%s)', locale: locale}, roller, result, roll);
      } catch (e) {
        return i18n.__({phrase: '%s fumbled a die roll (%s)', locale: locale}, roller, roll);
      }
    } else {
      return i18n.__({phrase: '%s fumbled a die roll (%s)', locale: locale}, roller, roll);
    }
  }

  bot.on("command.groupchat.roll", function (data) {
    if (data.args) {
      var roomJID = data.fromJID.bare();
      var roomConfig = nconf.get('rooms:' + roomJID.toString());
      var locale = roomConfig && roomConfig.locale ? roomConfig.locale : 'en';  
      var roller = data.fromJID.getResource();
      var roll = data.args.replace(/' '/g, '').toLowerCase();
      var message = null;
    
      if ("fudge" == roll) {
        message = rollFudge(locale, roll, roller);
      } else {
        message = rollDie(locale, roll, roller);
      }
    
      this.sendGroupChatMessage(roomJID, message);
    }
  }.bind(bot));

  bot.on("command.chat.roll", function (data) {
    if (data.args) {
      var fromJID = data.fromJID;
      var roomJID = fromJID.bare();
      var roomConfig = nconf.get('rooms:' + roomJID.toString());
      var locale = roomConfig && roomConfig.locale ? roomConfig.locale : 'en';  
      var roller = data.fromJID.getResource();
      var roll = data.args.replace(/' '/g, '').toLowerCase();
      var message = null;
    
      if ("fudge" == roll) {
        message = rollFudge(locale, roll, roller);
      } else {
        message = rollDie(locale, roll, roller);
      }
    
      this.sendPrivateChatMessage(fromJID, message);
    }
  }.bind(bot));

  var httpPort = process.env.FNI_CHATBOT_HTTP_PORT || process.env.OPENSHIFT_NODEJS_PORT || "8080";
  var httpIp = process.env.FNI_CHATBOT_HTTP_IP || process.env.OPENSHIFT_NODEJS_IP || "0.0.0.0";
  http.createServer(function(request, response) {
    response.writeHead(200);
    response.write("OK");
    response.end();
  }).listen(httpPort, httpIp);

}).call(this);