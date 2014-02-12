(function() {
  
  /* Imports */
  
  var i18n = require("i18n");
  var crypto = require('crypto');
  var dirty = require('dirty');
  var BotClient = require('./botclient.njs');

  /* Defaults */
  
  var DEFAULT_ROOM_SETTINGS = {
    'locale': 'fi'
  };
  
  /* Locale */

  i18n.configure({
    locales:['en', 'fi'],
    directory: __dirname + '/locales'
  });
  
  function Bot(userJid, password, nick, nconf, dataDir) {
    this._id = crypto.createHash('md5').update(userJid + '/' + nick).digest('hex');

    this._moderators = dirty(dataDir + '/' + this._id + '_moderators.db');
    this._moderators.set('online', []);
    
    /* Conf */
    
    this._nconf = nconf;
    
    /* Client */

    this._client = new BotClient(userJid, password, nick);
    
    /* Events */
	
	this._client.on("online", function (data) {
      console.log("Bot '" + this._client.userJid +  "' online");
      var rooms = this._getBotConfig('rooms');
      if (rooms) {
        Object.keys(rooms).forEach(function (room) {
          console.log("Joining room '" + room + "'");
          this._client.joinRoom(room, this._client.nick);
        }.bind(this));
      }
    }.bind(this));
	
	this._client.on("offline", function (data) {
      console.log("Bot offline");
	}.bind(this));
	
	this._client.on("presence", function (data) {
      if (data.role == 'moderator') {
        var moderatorsOnline = this._moderators.get('online');
        moderatorsOnline.push(data.fromJID.toString());
        this._moderators.set('online', moderatorsOnline);
      }
	}.bind(this));
	
	this._client.on("invite-message", function (data) {
      console.log("Invited to chat room " + data.fromJID.toString());
      var roomJID = data.fromJID.toString();
      this._setBotConfig('rooms:' + roomJID, DEFAULT_ROOM_SETTINGS, function (err) {
        if (!err) {
          this._client.joinRoom(roomJID, this._client.nick);
        } else {
          console.err(e);
        }
      }.bind(this));
	}.bind(this));
	
    this._client.on("command.chat.roomSetting", function (data) {
      if (data.args) {
        var moderatorsOnline = this._moderators.get('online');
        if (moderatorsOnline.indexOf(data.fromJID.toString()) != -1) {
          var settingIndex = data.args.indexOf(' ');
            if (settingIndex > -1) {
              var setting = data.args.substring(0, settingIndex);
              var value = data.args.substring(settingIndex + 1);    
              if (setting && value) {
                var roomJID = data.fromJID.bare();
                var roomConfig = this._getBotConfig('rooms:' + roomJID.toString());
                roomConfig[setting] = value;
                this._setBotConfig('rooms:' + roomJID.toString(), roomConfig);
              }
            }
          }
        }
     });

    this._client.on("command.groupchat.roll", function (data) {
      if (data.args) {
        var roomJID = data.fromJID.bare();
        var roomConfig = this._getBotConfig('rooms:' + roomJID.toString());
        var locale = roomConfig && roomConfig.locale ? roomConfig.locale : 'en';  
        var roller = data.fromJID.getResource();
        var roll = data.args.replace(/' '/g, '').toLowerCase();
        var message = null;
    
        if ("fudge" == roll) {
          message = this._rollFudge(locale, roll, roller);
        } else {
          message = this._rollDie(locale, roll, roller);
        }
    
        this._client.sendGroupChatMessage(roomJID, message);
      }
    }.bind(this));

    this._client.on("command.chat.roll", function (data) {
      if (data.args) {
        var fromJID = data.fromJID;
        var roomJID = fromJID.bare();
        var roomConfig = this._getBotConfig('rooms:' + roomJID.toString());
        var locale = roomConfig && roomConfig.locale ? roomConfig.locale : 'en';  
        var roller = data.fromJID.getResource();
        var roll = data.args.replace(/' '/g, '').toLowerCase();
        var message = null;
    
        if ("fudge" == roll) {
          message = rollFudge(locale, roll, roller);
        } else {
          message = rollDie(locale, roll, roller);
        }
    
        this._client.sendPrivateChatMessage(fromJID, message);
      }
    }.bind(this._client));
  }
  
  Bot.prototype._getBotConfig = function (key) {
    return this._nconf.get(this._client.userJid + ':' + key);
  };
  
  Bot.prototype._setBotConfig = function (key, value, callback) {
    this._nconf.set(this._client.userJid + ':' + key, value);
    this._nconf.save(function () {
      if (callback) {
        callback();
      }
    });
  };
  
  Bot.prototype._rollFudge = function(locale, roll, roller) {
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
  };

  Bot.prototype._rollDie = function(locale, roll, roller) {
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
  };
  
  module.exports = Bot;
  
}).call(this);
