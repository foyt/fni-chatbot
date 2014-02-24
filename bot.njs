(function() {
  
  /* Imports */
  
  var i18n = require("i18n");
  var JID = require('node-xmpp-core').JID;
  var _ = require('underscore');
  
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
    /* Conf */
    
    this._nconf = nconf;
    
    /* Client */

    this._client = new BotClient(userJid, password, nick);

    /* Events */
	
	this._client.on("online", function (data) {
      console.log("Bot '" + this._client.userJid +  "' online");
      var roomConfigs = this._getBotConfig('rooms');
      if (roomConfigs) {
        Object.keys(roomConfigs).forEach(function (room) {
          console.log("Joining room '" + room + "'");
          this._client.joinRoom(room, roomConfigs[room].nick);
        }.bind(this));
      }
    }.bind(this));
	
	this._client.on("offline", function (data) {
      console.log("Bot offline");
	}.bind(this));
	
	this._client.on("presence", function (data) {
      if (data.role == 'moderator') {
        var fromJID = data.fromJID.toString();
        var roomJID = data.fromJID.bare().toString();
        
        var roomSettings = this._getBotConfig("rooms:" + roomJID);
        var moderators = roomSettings.moderators||[];
        
        if ("unavailable" == data.type) {
          console.log("Room " + roomJID + ' moderator ' + fromJID + ' leaved');
          if (moderators.indexOf(fromJID) != -1) {
            moderators.splice(moderators.indexOf(fromJID), 1);
          }
        } else {
          console.log("Room " + roomJID + ' moderator ' + fromJID + ' entered');
          if (moderators.indexOf(fromJID) == -1) {
            moderators.push(fromJID);
          }
        }
        
        roomSettings.moderators = moderators;
        
        this._setBotConfig('rooms:' + roomJID, roomSettings, function (err) {
          console.log("Room config saved");
        });        
      }
	}.bind(this));
	
	this._client.on("invite-message", function (data) {
      console.log("Invited to chat room " + data.fromJID.toString());
      var roomJID = data.fromJID.toString();
      var roomSettings = _.clone(DEFAULT_ROOM_SETTINGS);
      roomSettings.nick = this._client.nick;
      
      this._setBotConfig('rooms:' + roomJID, roomSettings, function (err) {
        if (!err) {
          this._client.joinRoom(roomJID, roomSettings.nick);
        } else {
          console.err(e);
        }
      }.bind(this));
	}.bind(this));
	
    this._client.on("command.chat.roomSetting", function (data) {
      if (data.args) {
        var fromJID = data.fromJID.toString();
        var roomJID = data.fromJID.bare().toString();

        var roomSettings = this._getBotConfig('rooms:' + roomJID);
        var moderators = roomSettings.moderators||[];
        if (moderators.indexOf(fromJID) != -1) {
          var settingIndex = data.args.indexOf(' ');
          if (settingIndex > -1) {
            var setting = data.args.substring(0, settingIndex);
            var value = data.args.substring(settingIndex + 1);    
            if (setting && value) {
              console.log('RoomSetting ' + setting + ' to ' + value);
              roomSettings[setting] = value;
              this._setBotConfig('rooms:' + roomJID.toString(), roomSettings, function (err) {
                switch (setting) {
                  case 'nick':
                    this._client.leaveRoom(roomJID);
                    this._client.joinRoom(roomJID, roomSettings.nick);
                  break;                 
                }
              }.bind(this));
            }
          }
        } else {
          console.warn("non-modarator " + fromJID + " tried to change room settings");
        }
      }
     }.bind(this));

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
          message = this._rollDice(locale, roll, roller);
        }
    
        this._client.sendGroupChatMessage(roomJID, message, {
          'fcb-command': 'roll',
          'fcb-roll': roll
        });
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
          message = this._rollFudge(locale, roll, roller);
        } else {
          message = this._rollDice(locale, roll, roller);
        }
    
        this._client.sendPrivateChatMessage(fromJID, message, {
          'fcb-command': 'roll',
          'fcb-roll': roll
        });
      }
    }.bind(this));
  }
  
  Bot.prototype.ping = function (to, callback, timeout) {
    this._client.ping(to, callback, timeout);
  };
  
  Bot.prototype.getRooms = function () {
    var result = [];
    
    var roomConfigs = this._getBotConfig('rooms');
    if (roomConfigs) {
      var rooms = Object.keys(roomConfigs);
      
      for (var i = 0, l = rooms.length; i < l; i++) {
        var room = rooms[i];
        var roomJid = new JID(room);
        roomJid.setResource(roomConfigs[room].nick);
        result.push(roomJid);
      }
    }
    
    return result;
  };

  
  Bot.prototype.getUserJid = function () {
    return this._client.userJid;
  };
  
  Bot.prototype._getBotConfig = function (key) {
    return this._nconf.get(this._client.userJid + ':' + key)||{};
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
  
  Bot.prototype._validateRoll = function (roll) {
    return ((new RegExp("^[d0-9-+/*()]*$")).test(roll) && (!roll.match(/d[^0-9]/)));
  };
  
  Bot.prototype._evalRoll = function (roll) {
    var evil = eval;
    return evil('Math.round(' + roll
      .replace(/([0-9]{1,})([\*]{0,1})(d)([0-9]{1,})/g, "($1*(1 + (Math.random()*($4 - 1))))")
      .replace(/(d)([0-9]{1,})/g, "(1 + (Math.random()*($2 - 1)))") + ')');
  };

  Bot.prototype._rollDice = function(locale, text, roller) {
    var valid = true;
    var results = [];
    var i, l;
    
    var rolls = text.split(",");
    for (i = 0, l = rolls.length; i < l; i++) {
      var roll = rolls[i];
      if (this._validateRoll(roll)) {
        results.push({
          result: this._evalRoll(roll),
          roll: roll
        });
      } else {
        valid = false;
      }
    }
    
    if (valid) {
      var outcome = '';
      for (i = 0, l = results.length; i < l; i++) {
        outcome += results[i].result + ' (' + results[i].roll + ')';
        if (i < (l - 1)) {
          outcome += ', ';
        }
      }
    
      return i18n.__({phrase: '%s rolled %s', locale: locale}, roller, outcome);
    } else {
      return i18n.__({phrase: '%s fumbled a die roll (%s)', locale: locale }, roller, text);
    }
  };
  
  module.exports = Bot;
  
}).call(this);
