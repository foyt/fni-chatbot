(function() {
  
  var Client = require('node-xmpp-client');
  var ltx = require('ltx');
  var JID = require('node-xmpp-core').JID;
  var EventEmitter = require('events').EventEmitter;
  var _ = require('underscore');

  function BotClient(userJid, password, nick) {
    this.userJid = userJid;
    this.password = password;
    this.nick = nick;
    this._eventEmitter = new EventEmitter();
  
    var clientOpts = {
      jid: this.userJid + "/" + this.nick,
      password: this.password
    };
  
    if (process.env.FNI_CHATBOT_HOST) {
      clientOpts.host = process.env.FNI_CHATBOT_HOST;
    }
  
    this._client = new Client(clientOpts);
    this._client.connection.socket.setTimeout(0);
    this._client.connection.socket.setKeepAlive(true, 10000);
  
    this._client.on('online', function(data) {
      this.emit('online', data);
    }.bind(this));
  
    this._client.on('offline', function(data) {
      this.emit('offline', data);
    }.bind(this));
  
    this._client.on('error', function(e) {
      console.error(e);
    });
  
    this._client.on('stanza', function (stanza) {
      if (stanza.attrs.type !== 'error') {
        var x = stanza.getChild('x');
      
        if (stanza.is('message')) {
          var delay = stanza.getChild('delay');
          var invite = x ? x.getChild('invite') : null;
        
          if (invite) {
            var reason = invite.getChild('reason');
            this.emit("invite-message", {
              fromJID: new JID(stanza.attrs.from),
              toJID: new JID(stanza.attrs.to),
              inviteFrom: new JID(invite.attrs.from),
              reason: reason ? reason.getText() : null,
              stanza: stanza,
            });
          } else if (delay !== undefined) {
            this.emit("delayed-message", stanza);
          } else {
            this.emit("message", stanza);
          }
        } else {
          if (stanza.is('presence')) {
            if (x) {
              var item = x.getChild('item');
              if (item) {
                var status = x.getChild('status');  
                this.emit("presence", {
                  botJoined: (status && status.attrs.code == 110)||false,
                  fromJID: new JID(stanza.attrs.from),
                  toJID: new JID(stanza.attrs.to),
                  type: stanza.attrs.type,
                  nick: item.attrs.nick,
                  affiliation: item.attrs.affiliation,
                  role: item.attrs.role,
                  item: item,
                  stanza: stanza
                });
              }
            }
          } else if (stanza.is('iq')) {
            this.emit("iq", {
              stanza: stanza
            });
          }
        }
      }
    }.bind(this));
  
    this.on("message", function (stanza) {
      var body = stanza.getChild('body');
      if (body) {
        var bodyText = (body.getText()||'').replace(/\s\s+/g, '');
        if (bodyText) {
          if (bodyText.indexOf('/') === 0) {
            var commandText = bodyText.substring(1);
            var argIndex = commandText.indexOf(' ');
            var command = null;
            var commandArgs = null;

            if (argIndex > -1) {
              command = commandText.substring(0, argIndex);
              commandArgs = commandText.substring(argIndex + 1);
            } else {
              command = commandText;
            }
          
            if (stanza.attrs.type === 'groupchat') {
              this.emit("command.groupchat." + command, {
                fromJID: new JID(stanza.attrs.from),
                toJID: new JID(stanza.attrs.to),
                args: commandArgs,
                stanza: stanza
              });
            } else {
              this.emit("command.chat." + command, {
                fromJID: new JID(stanza.attrs.from),
                toJID: new JID(stanza.attrs.to),
                args: commandArgs,
                stanza: stanza
              });
            }
          }
        }
      }
    }.bind(this));
  }

  BotClient.prototype.joinRoom = function (roomJid, nick) {
    this._client.send(new ltx.Element('presence', { to: roomJid + '/' + nick })
      .c('x', { xmlns: 'http://jabber.org/protocol/muc' })
    );
  };

  BotClient.prototype.leaveRoom = function (roomJid, nick) {
    this._client.send(new ltx.Element('presence', { 'to': roomJid + '/' + nick, 'type': 'unavailable' }));
  };

  BotClient.prototype.sendGroupChatMessage = function (roomJid, message, extended) {
    var msgStanza = new ltx.Element('message', {
      type: 'groupchat',
      from: this.userJid + "/" + this.nick,
      to: roomJid.toString()
    }).c('body', extended).t(message);

    this._client.send(msgStanza);
  };

  BotClient.prototype.sendPrivateChatMessage = function (toJid, message, extended) {
    var msgStanza = new ltx.Element('message', {
      type: 'chat',
      from: this.userJid + "/" + this.nick,
      to: toJid.toString()
    }).c('body', extended).t(message);
  
    this._client.send(msgStanza);
  };

  BotClient.prototype.ping = function (to, callback, timeout) {
    var id = 'ping' + Math.ceil(Math.random() * 99999);
    var pingIq = new ltx.Element('iq', { 
      'from': this.userJid + "/" + this.nick,
      'to': to.toString(), 
      'type': 'get',
      'id': id 
    }).c('ping', { xmlns: 'urn:xmpp:ping' });
    
    this._client.send(pingIq);
    
    var iqListener = null;
    var timeoutId = null;
    
    timeoutId = setTimeout(function () {
      if (iqListener) {
        callback("timeout", null);
        this.removeListener("iq", iqListener);
      }
    }.bind(this), timeout);
    
    iqListener = function (iq) {
      var stanza = iq.stanza;
      if (stanza.attrs.id == id) {
        this.removeListener("iq", iqListener);
        clearTimeout(timeoutId);
        timeoutId = iqListener = null;
        
        var error = null;
        var errorChild = stanza.getChild('error');
        if (errorChild) {
          error = errorChild.getChild('service-unavailable') ? 'service-unavailable' : 'unknown error';
        }
        
        callback(error, stanza);
      }
    }.bind(this);
    
    this.on("iq", iqListener);
  };

  BotClient.prototype.on = function (event, handler) {
    this._eventEmitter.on(event, handler);
  };

  BotClient.prototype.emit = function (event, data) {
    return this._eventEmitter.emit(event, data||{});
  };
 
  BotClient.prototype.removeListener = function (event, listener) {
    this._eventEmitter.removeListener(event, listener);
  };
  
  module.exports = BotClient;
  
}).call(this);