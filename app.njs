var DEFAULT_ROOM_SETTINGS = {
  'locale': 'fi'
};

var i18n = require("i18n");
var nconf = require('nconf');
var dirty = require('dirty');
var moderators = dirty('moderators.db');
moderators.set('online', []);
  
var Bot = require('./bot.njs');

/* Locale */

i18n.configure({
  locales:['en', 'fi'],
  directory: __dirname + '/locales'
});

/* Conf */

nconf.file({ file: 'config.json' });

/* Bot */ 

var bot = new Bot(nconf.get('global:credentials:userJid'), nconf.get('global:credentials:password'), nconf.get('global:credentials:nick'));

/* Events */

bot.on("online", function (data) {
  var rooms = nconf.get('rooms');

  Object.keys(rooms).forEach(function (room) {
    this.joinRoom(room, this.nick);
  }.bind(this));

}.bind(bot));

bot.on("presence", function (data) {
  if (data.role == 'moderator') {
    var moderatorsOnline = moderators.get('online');
    moderatorsOnline.push(data.fromJID.toString());
    moderators.set('online', moderatorsOnline);
  }
}.bind(bot));

bot.on("invite-message", function (data) {
  var roomJID = data.fromJID.toString();
  nconf.set('rooms:' + roomJID, DEFAULT_ROOM_SETTINGS);
  this.joinRoom(roomJID, this.nick);
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

bot.on("command.groupchat.roll", function (data) {
  var roomJID = data.fromJID.bare();
  var roomConfig = nconf.get('rooms:' + roomJID.toString());
  var locale = roomConfig && roomConfig.locale ? roomConfig.locale : 'en';  

  if (data.args) {
    var roll = data.args.replace(/' '/g, '').toLowerCase();
    var roller = data.fromJID.getResource();
    var plus = '[ + ]';
    var minus = '[ - ]';
    var empty = '[   ]';
    
    if ("fudge" == roll) {
      var dice = [];
      var numericResult = 0;
      for (var i = 0, l = 4; i < l; i++) {
        var die = Math.round(Math.random() * 2) - 1;
        dice.push(die === 0 ? empty : die === -1 ? minus : plus);
        numericResult += die;
      }

      this.sendGroupChatMessage(roomJID, i18n.__({phrase: '%s rolled %s', locale: locale}, roller, dice.join(' ')));
    } else {
      if ((new RegExp("^[d0-9-+/*()]*$")).test(roll) && (!roll.match(/d[^0-9]/))) {
        try {
          var evil = eval;
          result = evil('Math.round(' + roll
            .replace(/([0-9]{1,})([\*]{0,1})(d)([0-9]{1,})/g, "($1*(1 + (Math.random()*($4 - 1))))")
            .replace(/(d)([0-9]{1,})/g, "(1 + (Math.random()*($2 - 1)))") + ')');
          this.sendGroupChatMessage(roomJID, i18n.__({phrase: '%s rolled %s (%s)', locale: locale}, roller, result, roll));
        } catch (e) {
          this.sendGroupChatMessage(roomJID, i18n.__({phrase: '%s fumbled a die roll (%s)', locale: locale}, roller, roll));
        }
      } else {
        this.sendGroupChatMessage(roomJID, i18n.__({phrase: '%s fumbled a die roll (%s)', locale: locale}, roller, roll));
      }
    }
  }
  
}.bind(bot));